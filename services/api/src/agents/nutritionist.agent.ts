import { Injectable, Logger } from '@nestjs/common';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { PrismaService } from '../common/prisma/prisma.service'; // Assuming you have this
import { NutritionUtils } from './utils/nutrition.utils';
import {
  AnalysisStatus,
  NutritionResponse,
  CalorieAnalysisResult,
  MealType,
} from './types/nutrition.types';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

@Injectable()
export class NutritionistAgent {
  private readonly logger = new Logger(NutritionistAgent.name);

  constructor(
    private readonly llm: LlmLanguageProvider,
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async estimateCalories(
    userId: string,
    mealType: MealType,
    imageBuffer: Buffer,
    context?: string,
  ): Promise<NutritionResponse> {
    const uploadPromise = this.cloudinary.uploadImage(imageBuffer, 'meal-logs');

    const prompt = NutritionUtils.generatePrompt(context, mealType);
    const rawResponse = await this.llm.analyzeImage(imageBuffer, prompt);

    let imageUrl = null;
    try {
      const result = await uploadPromise;
      imageUrl = result.secure_url;
    } catch (e) {
      this.logger.warn('Meal image upload failed', e);
    }

    let analysis = rawResponse.foodName
      ? (rawResponse as CalorieAnalysisResult)
      : NutritionUtils.parseResponse(JSON.stringify(rawResponse));

    if (!analysis) {
      this.logger.warn('LLM Parsing failed, using fallback.');
      analysis = NutritionUtils.getFallback(context || 'food');
    }
    const analysisWithImage = {
      ...rawResponse,
      imageUrl: imageUrl, // Attach it here
    };
    return this.applyConfidenceLogic(
      userId,
      analysisWithImage,
      mealType,
      imageBuffer,
    );
  }

  private async applyConfidenceLogic(
    userId: string,
    analysis: any,
    mealType: MealType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _imageBuffer: Buffer,
  ): Promise<NutritionResponse> {
    const { confidence } = analysis;

    // High Confidence (> 0.9) -> Auto Log
    if (confidence >= 0.9) {
      const log = await this.logToDatabase(userId, analysis, mealType);
      return {
        status: AnalysisStatus.AUTO_LOGGED,
        data: analysis,
        logId: log.id,
        warningMessage: undefined,
      };
    }

    // Low Confidence (< 0.7) -> Warn User
    if (confidence < 0.7) {
      return {
        status: AnalysisStatus.REQUIRES_REVIEW,
        data: analysis,
        warningMessage: `We aren't 100% sure. Is this ${analysis.foodName}? (Tap to Edit)`,
      };
    }

    // Middle Ground (0.7 - 0.9) -> Standard Flow (User confirms in UI)
    return {
      status: AnalysisStatus.CONFIRMED,
      data: analysis,
    };
  }

  async logToDatabase(
    userId: string,
    data: CalorieAnalysisResult & { imageUrl?: string },
    mealType: MealType,
  ) {
    return this.prisma.nutritionLog.create({
      data: {
        userId,
        foodName: data.foodName,
        calories: data.macros.calories,
        protein: data.macros.protein,
        carbs: data.macros.carbs,
        fat: data.macros.fat,
        mealType: mealType || 'Snack',
        imageUrl: data.imageUrl || null,
      },
    });
  }

  async getDailyCalorySummary(userId: string, dateString: string) {
    const date = dateString ? new Date(dateString) : new Date();
    const start = new Date(date.setHours(0, 0, 0, 0));
    const end = new Date(date.setHours(23, 59, 59, 999));

    // 1. Efficient DB Aggregation
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

    // 2. Fetch list only for display
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
}
