import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { NutritionUtils } from './utils/nutrition.utils';
import {
  AnalysisStatus,
  NutritionResponse,
  CalorieAnalysisResult,
  MealType,
} from './types/nutrition.types';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { createHash } from 'crypto';
import { startOfDay } from 'date-fns';

@Injectable()
export class NutritionistAgent {
  private readonly logger = new Logger(NutritionistAgent.name);
  private readonly CACHE_TTL = 300;

  constructor(
    private readonly llm: LlmLanguageProvider,
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly amqpConnection: AmqpConnection,
    private readonly redis: RedisService,
  ) {}

  async estimateCalories(
    userId: string,
    mealType: MealType,
    imageBuffer: Buffer,
    context?: string,
  ): Promise<NutritionResponse> {
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex');
    const cacheKey = `meal_est:${userId}:${imageHash}`;

    const cachedResult = await this.redis.get<NutritionResponse>(cacheKey);
    if (cachedResult) {
      this.logger.log(`Returning cached estimation for user ${userId}`);
      return cachedResult;
    }

    const uploadPromise = this.cloudinary.uploadImage(imageBuffer, 'meal-logs');
    const analysisPromise = this.llm.analyzeImage(
      imageBuffer,
      NutritionUtils.generatePrompt(context, mealType),
    );

    const [uploadResult, rawResponse] = await Promise.allSettled([
      uploadPromise,
      analysisPromise,
    ]);

    let imageUrl: string | null = null;
    if (uploadResult.status === 'fulfilled') {
      imageUrl = uploadResult.value.secure_url; // Access .value here
    } else {
      this.logger.warn('Meal image upload failed', uploadResult.reason); // Access .reason here
    }

    // --- Handling Analysis Result ---
    let analysis: CalorieAnalysisResult;

    // ⚠️ FIX: Check 'rawResponse.status', not 'analysisPromise.status'
    if (rawResponse.status === 'fulfilled') {
      const llmData = rawResponse.value; // ⚠️ FIX: Unwrap the value first

      analysis = llmData.foodName
        ? (llmData as CalorieAnalysisResult)
        : NutritionUtils.parseResponse(JSON.stringify(llmData));
    } else {
      // ⚠️ FIX: Access .reason on the result object
      this.logger.warn('LLM Analysis failed', rawResponse.reason);
      analysis = NutritionUtils.getFallback(context || 'food');
    }

    // 4. Prepare Response Data
    const fullAnalysis = { ...analysis, imageUrl };
    const { confidence } = fullAnalysis;

    let response: NutritionResponse;

    if (confidence >= 0.85) {
      response = {
        status: AnalysisStatus.CONFIRMED,
        data: fullAnalysis,
        warningMessage: undefined,
      };
    } else if (confidence < 0.65) {
      response = {
        status: AnalysisStatus.REQUIRES_REVIEW,
        data: fullAnalysis,
        warningMessage: `We aren't 100% sure. Is this ${analysis.foodName}?`,
      };
    } else {
      response = {
        status: AnalysisStatus.CONFIRMED,
        data: fullAnalysis,
      };
    }

    // 5. Cache the result
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.redis.set(
      `pending_log:${userId}:${tempId}`,
      { ...fullAnalysis, mealType },
      this.CACHE_TTL,
    );

    await this.redis.set(
      cacheKey,
      { ...response, logId: tempId },
      this.CACHE_TTL,
    );

    return { ...response, logId: tempId };
  }

  async confirmMealLog(
    userId: string,
    tempLogId: string,
    overrides?: Partial<CalorieAnalysisResult>,
  ) {
    const cacheKey = `pending_log:${userId}:${tempLogId}`;
    const cachedData = await this.redis.get<any>(cacheKey);

    if (!cachedData) {
      // It might have already been confirmed (idempotency) or expired
      // Check if it was already logged to prevent double-click issues
      const processedKey = `processed_log:${userId}:${tempLogId}`;
      const existingLogId = await this.redis.get<string>(processedKey);

      if (existingLogId) {
        return this.prisma.nutritionLog.findUnique({
          where: { id: existingLogId },
        });
      }

      throw new NotFoundException(
        'Meal estimation expired or invalid. Please scan again.',
      );
    }

    // Merge overrides (if user edited the name/calories)
    const finalData = { ...cachedData, ...overrides };
    const calories = Math.round(
      finalData.macros?.calories || finalData.calories || 0,
    );
    const protein = Math.round(
      finalData.macros?.protein || finalData.protein || 0,
    );
    const carbs = Math.round(finalData.macros?.carbs || finalData.carbs || 0);
    const fat = Math.round(finalData.macros?.fat || finalData.fat || 0);
    const today = startOfDay(new Date());

    // 1. Write to DB
    const log = await this.prisma.$transaction(async (tx) => {
      const newLog = await this.prisma.nutritionLog.create({
        data: {
          userId,
          foodName: finalData.foodName,
          calories,
          protein,
          carbs,
          fat,
          mealType: finalData.mealType || 'Snack',
          imageUrl: finalData.imageUrl || null,
        },
      });

      await tx.dailyLog.upsert({
        where: {
          userId_date: { userId, date: today },
        },
        create: {
          userId,
          date: today,
          caloriesIn: calories,
        },
        update: {
          caloriesIn: { increment: calories }, // Add to existing total
        },
      });
      return newLog;
    });

    // 2. Publish Event
    this.amqpConnection
      .publish('nutrify.events', 'user.meal_logged', {
        userId,
        mealType: log.mealType,
        calories: log.calories,
        isHealthy: this.isHealthyChoice(log),
      })
      .catch((e) => this.logger.error('Failed to emit meal event', e));

    // 3. Cleanup & Mark as Processed
    await this.redis.del(cacheKey); // Remove pending data
    await this.redis.set(`processed_log:${userId}:${tempLogId}`, log.id, 3600); // Mark ID as used for 1hr

    return log;
  }

  private isHealthyChoice(macros: any): boolean {
    return macros.protein > 10 && macros.fat < 20;
  }

  async getDailyCalorySummary(userId: string, dateString: string) {
    const date = dateString ? new Date(dateString) : new Date();
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end = new Date(date.setHours(23, 59, 59, 999));

    // Efficient DB Aggregation
    const aggregations = await this.prisma.nutritionLog.aggregate({
      _sum: {
        calories: true,
        protein: true,
        carbs: true,
        fat: true,
      },
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
    });

    // Fetch list only for display
    const logs = await this.prisma.nutritionLog.findMany({
      where: { userId, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      date,
      logs,
      totals: {
        calories: aggregations._sum.calories || 0,
        protein: aggregations._sum.protein || 0,
        carbs: aggregations._sum.carbs || 0,
        fat: aggregations._sum.fat || 0,
      },
    };
  }

  async getNutritonProduct(id: string) {
    try {
      const meal = await this.prisma.nutritionLog.findUnique({ where: { id } });

      if (!meal) throw new BadRequestException('Meal not found');

      return meal;
    } catch (error) {
      this.logger.error('An error occurred while trying to get meal', error);
      throw new InternalServerErrorException(
        'An error occurred while trying to get meal',
      );
    }
  }
}
