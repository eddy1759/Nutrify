import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { OpenAIService } from './openai.service';
import { LLMProvider } from './llm.interface';
import { GeminiAnalysis } from 'src/scan/dto/scan.dto';
import { Recipe, ShoppingListItem } from 'src/agents/types/nutrition.types';

@Injectable()
export class LlmLanguageProvider implements LLMProvider {
  private activeProvider: LLMProvider;
  private readonly logger = new Logger(LlmLanguageProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly openAIService: OpenAIService,
  ) {
    this.initializeProvider();
  }

  private async initializeProvider() {
    const primaryProvider = this.configService
      .get<string>('LLM_PRIMARY_PROVIDER')
      ?.toUpperCase();

    if (
      primaryProvider === 'OPENAI' &&
      this.configService.get('OPENAI_API_KEY')
    ) {
      this.activeProvider = this.openAIService;
      this.logger.log('Using OpenAI as the primary LLM provider.');
      return;
    }

    if (this.configService.get('GEMINI_API_KEY')) {
      this.activeProvider = this.geminiService;
      this.logger.log('Active LLM Provider: Gemini');
      return;
    }

    throw new Error('No valid LLM provider configuration found.');
  }

  analyzeIngredients(
    ingredients: string,
    novaScore: number,
  ): Promise<GeminiAnalysis> {
    if (!this.activeProvider) {
      throw new Error('LLM provider not initialized.');
    }
    // Routes the business request to the currently selected service
    return this.activeProvider.analyzeIngredients(ingredients, novaScore);
  }

  checkHealth(): Promise<boolean> {
    if (!this.activeProvider) return Promise.resolve(false);
    // Routes the health check to the currently selected service
    return this.activeProvider.checkHealth();
  }

  getProviderName(): string {
    if (!this.activeProvider) return 'NONE';
    return this.activeProvider.getProviderName();
  }

  analyzeImage(imageBuffer: Buffer, prompt: string): Promise<any> {
    if (!this.activeProvider) {
      throw new Error('LLM provider not initialized.');
    }
    // Routes the image analysis request to the currently selected service
    return this.activeProvider.analyzeImage(imageBuffer, prompt);
  }

  generateWeeklyMealPlan(userPrefs: string, allergies: string): Promise<any> {
    if (!this.activeProvider) {
      throw new Error('LLM provider not initialized.');
    }
    // Routes the meal plan generation request to the currently selected service
    return this.activeProvider.generateWeeklyMealPlan(userPrefs, allergies);
  }

  generateRecipes(
    ingredients: string[],
    allergies: string,
    userContext: string,
  ): Promise<Recipe[]> {
    if (!this.activeProvider) {
      throw new Error('LLM provider not initialized.');
    }

    return this.activeProvider.generateRecipes(
      ingredients,
      allergies,
      userContext,
    );
  }

  generateShoppingList(prompt: string): Promise<ShoppingListItem[]> {
    if (!this.activeProvider) {
      throw new Error('LLM provider not initialized');
    }

    return this.activeProvider.generateShoppingList(prompt);
  }

  modifyRecipe(
    originalRecipe: string,
    modificationRequest: string,
  ): Promise<Recipe> {
    if (!this.activeProvider) throw new Error('LLM provider not initialized');

    return this.activeProvider.modifyRecipe(
      originalRecipe,
      modificationRequest,
    );
  }

  // NOTE: This provider does not need to implement parseResponse,
  // as the concrete services (GeminiService/OpenAIService) handle their own output cleanup.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseResponse(_text: string): GeminiAnalysis {
    throw new Error(
      'LlmLanguageProvider does not implement parseResponse directly.',
    );
  }
}
