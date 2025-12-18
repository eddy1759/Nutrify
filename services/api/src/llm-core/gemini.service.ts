import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type GenerativeModel,
  type GenerateContentRequest,
  SchemaType,
} from '@google/generative-ai';
import { LLMProvider } from './llm.interface';
import { GeminiAnalysis } from 'src/scan/dto/scan.dto';
import { getNovaDescription } from 'src/scan/scan.service';
import {
  GEMINI_INGREDIENT_ANALYSIS_SCHEMA,
  MEAL_PLAN_SCHEMA_GEMINI as MEAL_PLAN_SCHEMA,
  RECIPE_GEMINI_SCHEMA,
  SHOPPING_LIST_GEMINI_SCHEMA,
} from './gemini-analysis.schema';
import {
  Recipe,
  RecipeSchema,
  ShoppingListItem,
  WeeklyPlanSchema,
} from 'src/agents/types/nutrition.types';
import {
  plannerUtils,
  ShoppingItemSchema,
} from 'src/agents/utils/planner.utils';
import z from 'zod';
import { CalorieAnalysisSchema } from '../agents/types/nutrition.types';

@Injectable()
export class GeminiService implements LLMProvider {
  private readonly model: GenerativeModel;
  private readonly logger = new Logger(GeminiService.name);

  constructor(private configService: ConfigService) {
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!geminiKey) return;

    const genAI = new GoogleGenerativeAI(geminiKey);
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
      generationConfig: {
        temperature: 0.2, // Low temp for deterministic JSON
        topP: 0.8,
        topK: 40,
        // maxOutputTokens: 2048,
      },
    });
  }

  getProviderName(): string {
    return 'GEMINI';
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (!this.model) return false;
      await this.model.generateContent('ping');
      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false;
    }
  }

  async analyzeIngredients(
    ingredients: string,
    novaScore: number,
  ): Promise<GeminiAnalysis> {
    const prompt = `
    --- ROLE ---
    You are **Dr. Food Scientist** — a senior food technologist with expertise in food additives, NOVA classification, shelf-life estimation, and clean-label reformulation. You must be precise, conservative in risk assessment, and strictly structured.

    --- INPUT & INSTRUCTIONS ---
    **INGREDIENT LIST:** "${ingredients}"
    **NOVA SCORE:** ${novaScore} (${getNovaDescription(novaScore)})

    **Task Breakdown:**
    1.  **Product Name:** Guess the likely product name based on the ingredients.
    2.  **Additives Analysis:** For each non-essential additive, describe its function, assign a risk level (Low/Medium/High/Unknown), and provide a brief, evidence-based explanation.
    3.  **Clean Recipe:** Provide a practical, clean-label, home-kitchen alternative recipe or substitution strategy.
    4.  **Functional Categories:** List ALL functional categories present (e.g., ["Colouring Agents", "Emulsifiers", "Sweeteners"]).
    5.  **Nutri-Score Estimate (A-E):** Assign a grade (A, B, C, D, E) based on implied nutrient composition (ingredients order suggests relative quantity). A/B for beneficial, D/E for high sugar/fat/sodium.

    --- OUTPUT FORMAT ---
    Return ONLY a single JSON object that strictly conforms to the provided schema. Do not include any markdown fences (e.g., \`\`\`json).
  `;
    try {
      const request: GenerateContentRequest = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_INGREDIENT_ANALYSIS_SCHEMA,
        },
      };
      const result = await this.model.generateContent(request);
      const jsonText = result.response.text();
      const text = jsonText.trim();
      return JSON.parse(text) as GeminiAnalysis;
    } catch (error) {
      this.logger.error('Gemini Analysis Failed:', error.message);
      throw error; // Let the Circuit Breaker catch this
    }
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<any> {
    const analysisSchema = {
      type: SchemaType.OBJECT,
      properties: {
        foodName: { type: SchemaType.STRING },
        servingSize: { type: SchemaType.STRING },
        macros: {
          type: SchemaType.OBJECT,
          properties: {
            calories: { type: SchemaType.NUMBER },
            protein: { type: SchemaType.NUMBER },
            carbs: { type: SchemaType.NUMBER },
            fat: { type: SchemaType.NUMBER },
          },
          required: ['calories', 'protein', 'carbs', 'fat'],
        },
        confidence: { type: SchemaType.NUMBER, description: '0.0 to 1.0' },
        explanation: { type: SchemaType.STRING },
        suggestions: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: ['foodName', 'macros', 'confidence', 'explanation'],
    };
    try {
      // Convert Buffer to Base64 for Gemini
      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: 'image/jpeg', // simplified assumption
        },
      };

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: analysisSchema as any,
          temperature: 0.2, // Low temp for factual accuracy
        },
      });
      const text = result.response.text();
      const parsed = JSON.parse(text);

      // Use your existing robust parsing logic here!
      // return this.parseResponse(text);
      return CalorieAnalysisSchema.parse(parsed);
    } catch (error) {
      this.logger.error('Gemini Vision Analysis Failed:', error);
      return {
        foodName: 'Analysis Failed',
        servingSize: 'N/A',
        macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        confidence: 0,
        explanation: 'AI service temporarily unavailable.',
        suggestions: [],
        alternativeFoods: [],
      };
    }
  }

  async generateWeeklyMealPlan(userPrefs: string, allergies: string) {
    const prompt = `
    --- ROLE ---
    You are an **Expert Registered Dietitian** and **Professional Chef**. Your task is to generate a comprehensive, actionable 7-Day Meal Plan.

    --- USER INPUT & CONSTRAINTS ---
    1. **Allergies to AVOID (STRICT):** ${allergies}
    2. **User Preferences/Goals:** ${userPrefs}
    3. **OUTPUT FORMAT (STRICT):** The *entire* output must be a single, valid JSON object that strictly adheres to the provided JSON Schema. Do not include any introductory text, notes, or explanations outside the JSON block.
    4. **MEAL REQUIREMENTS:** Include Breakfast, Lunch, and Dinner for all 7 days. Also include a single 'Snack' field per day. Ensure meals are balanced, varied, and logistically sound for a week.

    --- REQUIRED JSON SCHEMA ---
    ${MEAL_PLAN_SCHEMA}
    `;
    try {
      const request: GenerateContentRequest = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MEAL_PLAN_SCHEMA,
        },
      };
      const result = await this.model.generateContent(request);
      const jsonText = result.response.text();
      const text = jsonText.trim();
      return plannerUtils.parseResponse(text, WeeklyPlanSchema);
    } catch (error) {
      this.logger.error('Gemini Meal Plan Generation Failed:', error);
      throw error;
    }
  }

  parseResponse(text: string): GeminiAnalysis {
    const fallback: GeminiAnalysis = {
      productName: 'Scanned Product',
      additives: [],
      cleanRecipe: 'Could not generate recipe at this time.',
    };

    try {
      let jsonString = text.trim();

      // Remove markdown code blocks
      const codeBlockMatch = jsonString.match(
        /```(?:json)?\s*([\s\S]*?)\s*```/,
      );
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1].trim();
      }

      // Extract JSON object boundaries
      const startIndex = jsonString.indexOf('{');
      const endIndex = jsonString.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        this.logger.warn('No valid JSON object found in Gemini response');
        return fallback;
      }

      jsonString = jsonString.substring(startIndex, endIndex + 1);

      // This regex finds string values and escapes any raw newlines within them
      jsonString = this.sanitizeJsonString(jsonString);

      const parsed = JSON.parse(jsonString);

      // Validate and sanitize response
      return {
        productName:
          typeof parsed.productName === 'string'
            ? parsed.productName.substring(0, 200)
            : fallback.productName,
        additives: Array.isArray(parsed.additives)
          ? parsed.additives
              .filter(
                (a: any) =>
                  a &&
                  typeof a.name === 'string' &&
                  typeof a.function === 'string' &&
                  ['Low', 'Medium', 'High', 'Unknown'].includes(a.risk),
              )
              .slice(0, 50)
          : fallback.additives,
        cleanRecipe:
          typeof parsed.cleanRecipe === 'string'
            ? parsed.cleanRecipe.substring(0, 2000)
            : fallback.cleanRecipe,
        functionalCategories: Array.isArray(parsed.functionalCategories)
          ? parsed.functionalCategories
          : fallback.functionalCategories,

        estimatedShelfLife:
          typeof parsed.estimatedShelfLife === 'string'
            ? parsed.estimatedShelfLife
            : fallback.estimatedShelfLife,
      };
    } catch (error) {
      this.logger.error('Failed to parse Gemini response:', error);
      this.logger.debug('Raw response that failed:', text.substring(0, 500));
      return fallback;
    }
  }

  async generateRecipes(
    ingredients: string[],
    allergies: string,
    userContext: string,
  ): Promise<Recipe[]> {
    const prompt = `
        ROLE: Creative Chef.
        TASK: Suggest 3 distinct recipes using primarily these ingredients: ${ingredients.join(', ')}.
        CONTEXT: Allergies to AVOID: ${allergies}. User Notes: ${userContext}.
        OUTPUT FORMAT: STRICT JSON Array of 3 Recipe objects.
        `;

    // This is the common pattern for structured output
    const request: GenerateContentRequest = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: RECIPE_GEMINI_SCHEMA, // Generate an array of recipes
        },
      },
    };

    const result = await this.model.generateContent(request);
    const jsonText = result.response.text();

    // Use the Zod schema for final validation and typing
    return plannerUtils.parseResponse(jsonText, z.array(RecipeSchema));
  }

  async modifyRecipe(
    originalRecipe: string,
    modificationRequest: string,
  ): Promise<Recipe> {
    const prompt = `
        ROLE: Expert Food Scientist.
        TASK: Modify the recipe below based on this request: "${modificationRequest}".
        ORIGINAL RECIPE: ${originalRecipe}
        CRITICAL: Maintain the original essence but adapt ingredients/steps. Re-calculate macros.
        OUTPUT: Strict JSON matching the Recipe Schema.
        `;

    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RECIPE_GEMINI_SCHEMA, // Generate a single recipe object
      },
    };

    const result = await this.model.generateContent(request);
    const jsonText = result.response.text();

    return plannerUtils.parseResponse(jsonText, RecipeSchema);
  }

  async generateShoppingList(prompt: string): Promise<ShoppingListItem[]> {
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SHOPPING_LIST_GEMINI_SCHEMA,
      },
    };

    const result = await this.model.generateContent(request);
    const jsonText = result.response.text();

    return plannerUtils.parseResponse(jsonText, z.array(ShoppingItemSchema));
  }

  private sanitizeJsonString(jsonString: string): string {
    // Process character by character to properly handle string boundaries
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString) {
        // Escape problematic characters inside strings
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }

    return result;
  }
}
