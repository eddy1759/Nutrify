import { Recipe, ShoppingListItem } from 'src/agents/types/nutrition.types';
import { GeminiAnalysis } from 'src/scan/dto/scan.dto';

export interface LLMProvider {
  analyzeIngredients(
    ingredients: string,
    novaScore: number,
  ): Promise<GeminiAnalysis>;
  checkHealth(): Promise<boolean>;
  analyzeImage(imageBuffer: Buffer, prompt: string): Promise<any>;
  generateWeeklyMealPlan(userPrefs: string, allergies: string): Promise<any>;
  getProviderName(): string;
  parseResponse(text: string): GeminiAnalysis;
  generateRecipes(
    ingredients: string[],
    allergies: string,
    userContext: string,
  ): Promise<Recipe[]>;

  // NEW: Single recipe modification method
  modifyRecipe(
    originalRecipe: string,
    modificationRequest: string,
  ): Promise<Recipe>;

  // NEW: Shopping list aggregation method
  generateShoppingList(prompt: string): Promise<ShoppingListItem[]>;
}
