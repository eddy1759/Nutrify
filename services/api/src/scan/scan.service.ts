import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

import { firstValueFrom, timeout } from 'rxjs';
import * as Tesseract from 'tesseract.js';
import { z } from 'zod';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { withRetry } from '../common/utils/retry.util';
import {
  CircuitBreaker,
  CircuitState,
} from '../common/utils/circuit-breaker.util';
import {
  OcrProcessingException,
  InvalidImageException,
  InsufficientTextException,
} from './exceptions/scan.exceptions';
import type { GeminiAnalysis, ServiceHealth } from './dto/scan.dto';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { ProductScan } from '@prisma/client';

const CONFIG = {
  OCR_MIN_TEXT_LENGTH: 5,
  OCR_MAX_TEXT_LENGTH: 5000,
  ML_SERVICE_TIMEOUT_MS: 10000,
  LLM_TIMEOUT_MS: 30000,
  CACHE_TTL: 3600,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024,
  SUPPORTED_IMAGE_SIGNATURES: [
    { signature: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
    { signature: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
    { signature: [0x47, 0x49, 0x46], mime: 'image/gif' },
    { signature: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' },
  ],
} as const;

export function getNovaDescription(score: number): string {
  const map = {
    1: 'Unprocessed',
    2: 'Culinary Ingredient',
    3: 'Processed',
    4: 'Ultra-Processed',
  };
  return map[score] || 'Unknown';
}

const MLServiceResponseSchema = z.object({
  nova_group: z.number().min(1).max(4),
  confidence: z.number().min(0).max(1),
  contributing_ingredients: z.array(z.string()).optional(),
  processing_reasons: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
});

@Injectable()
export class ScanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScanService.name);
  private readonly mlServiceUrl: string;

  private readonly mlCircuitBreaker: CircuitBreaker;
  private readonly llmCircuitBreaker: CircuitBreaker;
  private tesseractWorker: Tesseract.Worker | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly redisService: RedisService,
    private readonly llmProvider: LlmLanguageProvider,
    private readonly amqpConnection: AmqpConnection,
  ) {
    const mlUrl = this.configService.get<string>('ML_SERVICE_URL');
    if (!mlUrl) {
      this.logger.warn('ML_SERVICE_URL not configured - Using fallback logic.');
    }
    this.mlServiceUrl = mlUrl || '';

    this.mlCircuitBreaker = new CircuitBreaker('ML_SERVICE', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });

    this.llmCircuitBreaker = new CircuitBreaker('LLM_SERVICE', {
      failureThreshold: 3,
      successThreshold: 1,
      timeout: 120000,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      this.tesseractWorker = await Tesseract.createWorker('eng', 1, {
        logger: () => {},
        // Tell Tesseract to use local files instead of downloading
        langPath: path.join(process.cwd(), 'tessdata'),
        cachePath: path.join(process.cwd(), 'tessdata'),
        gzip: false,
      });
      this.logger.log('Tesseract worker initialized (Offline Mode)');
    } catch (error) {
      this.logger.warn('Failed to pre-initialize Tesseract worker:', error);
    }
  }

  async onModuleDestroy() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.logger.log('Tesseract worker terminated');
    }
  }

  async processImageScan(
    userId: string,
    imageBuffer: Buffer,
    correlationId?: string,
    productName?: string,
  ) {
    const logContext = { correlationId, userId };
    const startTime = Date.now();

    // Check Cache
    const cacheKey = await this.getCacheKeyFromImage(imageBuffer);
    const cachedResult = await this.redisService.get<ProductScan>(cacheKey);

    if (cachedResult) {
      this.logger.log({
        message: '⚡ Cache hit - Returning instant result',
        ...logContext,
      });
      return cachedResult;
    }

    this.logger.log({ message: 'Starting image scan', ...logContext });

    const uploadPromise = this.cloudinary
      .uploadImage(imageBuffer, 'product-scans')
      .then((res) => res.secure_url)
      .catch((err) => {
        this.logger.error('Failed to upload scan image', err);
        return null; // Fail gracefully
      });

    // Validate Input
    this.validateInputs(userId, imageBuffer);

    try {
      const userPromise = this.prisma.user.findUnique({
        where: { id: userId },
        select: { allergies: true },
      });

      // OCR Processing
      const ocrStart = Date.now();
      const { text, confidence: ocrConfidence } =
        await this.performOcr(imageBuffer);

      if (this.configService.get<string>('NODE_ENV') === 'development') {
        this.logger.debug({
          message: 'OCR completed',
          durationMs: Date.now() - ocrStart,
          textLength: text.length,
          ...logContext,
        });
      }

      if (!text || text.trim().length < CONFIG.OCR_MIN_TEXT_LENGTH) {
        throw new InsufficientTextException(
          'Could not extract sufficient text. Please ensure label is clear.',
        );
      }

      const sanitizedText = this.preprocessIngredients(text);

      // ML Classification
      const mlStart = Date.now();
      const mlResult = await this.predictNovaWithResilience(sanitizedText);
      const analysis = await this.analyzeWithGeminiResilience(
        sanitizedText,
        mlResult.nova_group,
      );

      if (this.configService.get<string>('NODE_ENV') === 'development') {
        this.logger.debug({
          message: 'ML classification completed',
          durationMs: Date.now() - mlStart,
          novaGroup: mlResult.nova_group,
          confidence: mlResult.confidence,
          source: mlResult.processing_reasons?.[0] || 'ML Model',
          ...logContext,
        });
      }

      const user = await userPromise;
      const universalDetected = mlResult.allergens || [];
      const userAllergies = user?.allergies || [];
      // Find items that are in both lists
      const dangerousMatches = universalDetected.filter((detected) =>
        userAllergies.includes(detected),
      );

      const isSafe = dangerousMatches.length === 0;
      let alertMessage = null;
      if (!isSafe) {
        alertMessage = `CRITICAL WARNING: Contains ${dangerousMatches.join(', ')}!`;
        this.logger.warn(
          `User ${userId} scanned dangerous food: ${dangerousMatches}`,
        );
      }

      const imageUrl = await uploadPromise;

      // Data Sanitization
      const finalData = this.sanitizeScanData({
        userId,
        rawText: sanitizedText,
        novaScore: mlResult.nova_group,
        nutriScore: analysis.nutriScore,
        allergens: universalDetected,
        productName: productName || analysis.productName,
        additives: analysis.additives,
        cleanRecipe: analysis.cleanRecipe,
        ocrConfidence,
        mlConfidence: mlResult.confidence,
        functionalCategories: analysis.functionalCategories,
        estimatedShelfLife: analysis.estimatedShelfLife,
        isSafe: isSafe,
        allergenAlert: alertMessage,
        imageUrl,
      });

      // DB Persistence
      const scan = await withRetry(
        () => this.prisma.productScan.create({ data: finalData }),
        { maxAttempts: 3, initialDelayMs: 500 },
        this.logger,
        'Database save',
      );

      this.emitEvent('user.scan_created', {
        userId,
        scanId: scan.id,
        isSafe: scan.isSafe,
      });

      // Update Cache
      await this.redisService.set(cacheKey, scan, 3600);

      this.logger.log({
        message: 'Scan completed successfully',
        scanId: scan.id,
        totalDurationMs: Date.now() - startTime,
        ...logContext,
      });

      return scan;
    } catch (error) {
      this.logger.error({
        message: 'Image scan failed',
        error: error.message,
        stack: error.stack,
        totalDurationMs: Date.now() - startTime,
        ...logContext,
      });
      throw error;
    }
  }

  /**
   * Fetch a single scan by ID, ensuring it belongs to the user.
   */
  async getScanById(scanId: string, userId: string) {
    const scan = await this.prisma.productScan.findUnique({
      where: { id: scanId },
    });

    if (!scan) throw new NotFoundException('Scan not found');
    if (scan.userId !== userId) throw new ForbiddenException('Access denied');

    return scan;
  }

  /**
   * Fetch all scans for a user with pagination.
   */
  async getUserScans(userId: string, limit = 20, offset = 0) {
    const [data, total] = await Promise.all([
      this.prisma.productScan.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        // Select fields needed for the list view to save bandwidth
        select: {
          id: true,
          productName: true,
          novaScore: true,
          imageUrl: true,
          createdAt: true,
        },
      }),
      this.prisma.productScan.count({ where: { userId } }),
    ]);

    return {
      data,
      meta: {
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
      },
    };
  }

  /**
   * Delete a scan from history.
   */
  async deleteScan(scanId: string, userId: string) {
    const scan = await this.prisma.productScan.findUnique({
      where: { id: scanId },
    });

    if (!scan) throw new NotFoundException('Scan not found');
    if (scan.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.productScan.delete({ where: { id: scanId } });
    return { success: true, message: 'Scan deleted' };
  }

  private async performOcr(
    buffer: Buffer,
  ): Promise<{ text: string; confidence: number }> {
    try {
      if (this.tesseractWorker) {
        const {
          data: { text, confidence },
        } = await this.tesseractWorker.recognize(buffer);
        return { text, confidence };
      }
      const result = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {},
      });
      return { text: result.data.text, confidence: result.data.confidence };
    } catch (error) {
      throw new OcrProcessingException(
        'OCR failed. Please try a clearer photo.',
        error as Error,
      );
    }
  }

  private async predictNovaWithResilience(ingredients: string) {
    const fallback = () => {
      this.logger.warn('using Rule-Based Fallback for Nova Score.');
      return {
        nova_group: this.fallbackNovaPrediction(ingredients),
        confidence: 0.3,
        processing_reasons: ['Service Unavailable - Rule Based Fallback'],
        allergens: [],
      };
    };

    if (!this.mlServiceUrl) return fallback();

    try {
      return this.mlCircuitBreaker.execute(
        () =>
          withRetry(
            () => this.predictNova(ingredients),
            {
              maxAttempts: 2,
              initialDelayMs: 500,
              retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'timeout'],
            },
            this.logger,
            'ML prediction',
          ),
        fallback,
      );
    } catch (e) {
      this.logger.error(`Circuit Breaker failed completely: ${e.message}`);
      return fallback();
    }
  }

  private async predictNova(ingredients: string) {
    try {
      if (!this.mlServiceUrl || this.mlServiceUrl === '') {
        this.logger.warn('ML_SERVICE_URL is missing. Skipping ML request.');
        throw new Error('ML_SERVICE_URL_MISSING');
      }

      const hfToken = this.configService.get<string>('HF_ACCESS_TOKEN');

      const { data } = await firstValueFrom(
        this.httpService
          .post(
            `${this.mlServiceUrl}/predict`,
            { ingredients },
            {
              headers: {
                'Content-Type': 'application/json',
                ...(hfToken ? { Authorization: `Bearer ${hfToken}` } : {}),
              },
              timeout: CONFIG.ML_SERVICE_TIMEOUT_MS,
            },
          )
          .pipe(timeout(CONFIG.ML_SERVICE_TIMEOUT_MS)),
      );
      const validated = MLServiceResponseSchema.parse(data);
      if (validated.confidence < 0.5) {
        this.logger.warn(
          `Low ML confidence (${validated.confidence}). Hybrid fallback.`,
        );
        return {
          ...validated,
          nova_group: this.fallbackNovaPrediction(ingredients),
          allergens: null,
        };
      }
      return validated;
    } catch (error) {
      this.logger.warn(`ML Service Failed: ${error.message}. Using Fallback.`);
      throw error;
    }
  }

  private async analyzeWithGeminiResilience(
    ingredients: string,
    novaScore: number,
  ): Promise<GeminiAnalysis> {
    const fallback = (): GeminiAnalysis => ({
      productName: 'Scanned Product',
      additives: this.extractAdditivesFromText(ingredients),
      cleanRecipe: this.generateBasicRecipe(ingredients, novaScore),
      functionalCategories: [],
      estimatedShelfLife: 'Unknown',
    });

    return this.llmCircuitBreaker.execute(
      () =>
        withRetry(
          () => this.llmProvider.analyzeIngredients(ingredients, novaScore),
          {
            maxAttempts: 2,
            initialDelayMs: 1000,
            retryableErrors: ['429', '503', 'timeout'],
          },
          this.logger,
          `LLM analysis (${this.llmProvider.getProviderName()})`,
        ),
      fallback,
    );
  }

  private sanitizeScanData(data: any) {
    const toTitleCase = (str: string) => {
      if (!str) return '';
      return str.replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
      );
    };

    return {
      userId: data.userId,
      rawText: data.rawText?.trim(),
      novaScore: data.novaScore,
      imageUrl: data.imageUrl || null,
      productName: toTitleCase(data.productName || 'Unknown Product').substring(
        0,
        100,
      ),

      // Ensure additives is a valid object/array
      additives: data.additives || [],

      // Clean recipe
      cleanRecipe: data.cleanRecipe?.trim() || 'No recipe available.',

      // Metrics
      ocrConfidence: data.ocrConfidence
        ? parseFloat(data.ocrConfidence.toFixed(2))
        : null,
      mlConfidence: data.mlConfidence
        ? parseFloat(data.mlConfidence.toFixed(2))
        : null,

      functionalCategories: Array.isArray(data.functionalCategories)
        ? data.functionalCategories.map((c: string) => toTitleCase(c.trim()))
        : [],

      estimatedShelfLife: data.estimatedShelfLife?.trim() || 'Unknown',
      isSafe: data.isSafe,
      allergenAlert: data.allergenAlert,
    };
  }

  private validateInputs(userId: string, imageBuffer: Buffer): void {
    if (!userId) throw new InvalidImageException('Invalid User ID');
    if (!imageBuffer || imageBuffer.length === 0)
      throw new InvalidImageException('Empty Image');
    if (imageBuffer.length > CONFIG.MAX_IMAGE_SIZE_BYTES)
      throw new InvalidImageException('Image too large');

    const isValidSignature = CONFIG.SUPPORTED_IMAGE_SIGNATURES.some((format) =>
      format.signature.every((byte, index) => imageBuffer[index] === byte),
    );
    if (!isValidSignature)
      throw new InvalidImageException('Invalid image format.');
  }

  private preprocessIngredients(text: string): string {
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[|_\\/<>]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/,(\s*),/g, ',')
      .substring(0, CONFIG.OCR_MAX_TEXT_LENGTH)
      .trim()
      .toLowerCase();
  }

  private async getCacheKeyFromImage(buffer: Buffer): Promise<string> {
    const crypto = await import('crypto');
    return `scan:${crypto.createHash('md5').update(buffer).digest('hex')}`;
  }

  private fallbackNovaPrediction(ingredients: string): number {
    const upfIndicators = [
      'maltodextrin',
      'hydrogenated',
      'high fructose',
      'monosodium glutamate',
      'carrageenan',
      'xanthan gum',
      'aspartame',
      'sucralose',
      'red 40',
      'yellow 5',
    ];
    const simpleIngredients = [
      'water',
      'salt',
      'sugar',
      'flour',
      'eggs',
      'milk',
      'yeast',
      'butter',
      'oil',
    ];
    const text = ingredients.toLowerCase();
    const matches = upfIndicators.filter((i) => text.includes(i));
    if (matches.length >= 3) return 4;
    if (matches.length >= 1) return 3;
    const simpleMatches = simpleIngredients.filter((i) => text.includes(i));
    if (simpleMatches.length >= 3 && matches.length === 0) return 1;
    return 2;
  }

  private extractAdditivesFromText(ingredients: string): Array<any> {
    const additivePatterns = [
      {
        pattern: /(xanthan|guar|carrageenan) gum/i,
        function: 'Thickener',
        risk: 'Low',
      },
      {
        pattern: /(tbhq|bht|benzoate|sorbate)/i,
        function: 'Preservative',
        risk: 'Medium',
      },
      { pattern: /e\d{3,4}/i, function: 'Additive', risk: 'Unknown' },
    ];
    const results = [];
    for (const p of additivePatterns) {
      const match = ingredients.match(p.pattern);
      if (match)
        results.push({
          name: match[0],
          function: p.function,
          risk: p.risk,
          explanation: 'Rule-based detection',
        });
    }
    return results;
  }

  private generateBasicRecipe(ingredients: string, score: number): string {
    return score >= 3
      ? 'This product contains industrial additives. Try making a version with whole ingredients like flour, sugar, and butter.'
      : 'This product is minimally processed. You can recreate it using similar fresh ingredients.';
  }

  async checkHealth(): Promise<ServiceHealth[]> {
    const providerName = this.llmProvider.getProviderName();
    const checks = [
      this.checkService(
        'ML_SERVICE',
        () =>
          firstValueFrom(
            this.httpService
              .get(`${this.mlServiceUrl}/health`)
              .pipe(timeout(2000)),
          ),
        this.mlCircuitBreaker,
      ),
      this.checkService(
        `LLM_SERVICE (${providerName})`,
        async () => {
          const isHealthy = await this.llmProvider.checkHealth();
          if (!isHealthy)
            throw new Error('LLM Provider reported unhealthy status');
        },
        this.llmCircuitBreaker,
      ),
      this.checkService(
        'DATABASE',
        () => this.prisma.$queryRaw`SELECT 1`,
        null,
      ),
    ];
    return Promise.all(checks);
  }

  private async checkService(
    name: string,
    checkFn: () => Promise<any>,
    cb: CircuitBreaker | null,
  ): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await checkFn();
      return {
        service: name,
        status: 'healthy',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (e) {
      return {
        service: name,
        status: cb?.getState() === CircuitState.OPEN ? 'unhealthy' : 'degraded',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
        details: e.message,
      };
    }
  }

  private emitEvent(pattern: string, payload: any) {
    this.amqpConnection
      .publish('nutrify.events', pattern, payload)
      .catch((err) => this.logger.error(`Failed to emit ${pattern}`, err));
  }
}
