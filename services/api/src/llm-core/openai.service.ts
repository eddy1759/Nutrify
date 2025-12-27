import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm.interface';
import { GeminiAnalysis } from '../scan/dto/scan.dto';
import OpenAI from 'openai';
import { getNovaDescription } from '../scan/scan.service';
import {
  Recipe,
  RecipeSchema,
  ShoppingListItem,
} from 'src/agents/types/nutrition.types';
import {
  plannerUtils,
  ShoppingItemSchema,
  WeeklyMealPlanSchema,
} from 'src/agents/utils/planner.utils';
import z from 'zod';

@Injectable()
export class OpenAIService implements LLMProvider {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) return;

    this.openai = new OpenAI({ apiKey });
  }

  getProviderName(): string {
    return 'OPENAI';
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (!this.openai) return false;
      await this.openai.models.retrieve('gpt-3.5-turbo'); // Light check
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
    const systemPrompt = `
        You are Dr. Food Scientist — a senior food technologist with expertise in food additives, NOVA classification, shelf-life estimation, and clean-label reformulation.

        You must be precise, conservative in risk assessment, and strictly structured.
        You must NEVER invent ingredients or include commentary outside the requested JSON.
        You must return ONLY a single, valid JSON object that exactly matches the required schema.
        `;

    const userPrompt = `
INGREDIENT LIST:
"${ingredients}"

NOVA SCORE:
${novaScore} — ${getNovaDescription(novaScore)}

TASKS:
1. Infer the most likely generic product name (do not guess brands unless obvious).
2. Identify ONLY additives or industrial ingredients (ignore basic foods like milk, flour, sugar, salt, water).
3. For each additive, provide its technological function, health risk (Low/Medium/High), and a short factual explanation.
4. Provide ONE practical clean-label home alternative recipe using simple pantry ingredients.
5. List ALL functional categories present in the ingredient list.
6. Estimate the product's shelf life using food science reasoning.
7. ESTIMATE NUTRI-SCORE: Based on the ingredients order (sugar/fat content implied), assign a grade (A, B, C, D, E).
   - A/B: High fiber, fruit, vegetable, protein.
   - D/E: High sugar, saturated fat, sodium.

OUTPUT RULES (MANDATORY):
- Return ONLY a valid JSON object.
- Do NOT include markdown, comments, or explanations.
- Do NOT omit any required field.
- All arrays must be present, even if empty.
- Use concise, professional language.

JSON SCHEMA (MUST MATCH EXACTLY):
{
  "productName": "string",
  "additives": [
    {
      "name": "string",
      "nutriScore": "D",
      "function": "string",
      "risk": "Low" | "Medium" | "High",
      "explanation": "string"
    }
  ],
  "cleanRecipe": "string",
  "functionalCategories": ["string"],
  "estimatedShelfLife": "string"
}

BEGIN OUTPUT NOW.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        top_p: 0.8,
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0].message.content;
      return this.parseResponse(text);
    } catch (error) {
      this.logger.error('OpenAI Analysis Failed:', error.message);
      throw error;
    }
  }

  async generateWeeklyMealPlan(userPrefs: string, allergies: string) {
    const systemPrompt = `
You are an Expert Registered Dietitian and Professional Chef.
Your job is to generate a comprehensive, accurate, and safe 7-Day Meal Plan.

REQUIREMENTS:
- STRICTLY avoid all allergies: ${allergies || 'None provided'}
- Respect user preferences: ${userPrefs || 'None provided'}
- All outputs MUST be safe, realistic, and nutritionally sound.
- ALL responses must follow the exact JSON schema below.
- NEVER include commentary outside JSON.
`;

    const userPrompt = `
Generate a 7-Day Meal Plan.

OUTPUT FORMAT (STRICT JSON):
{
  "weeklySummary": "string",
  "days": [
    {
      "day": "Monday",
      "meals": {
        "Breakfast": {
          "name": "string",
          "description": "string",
          "ingredients": ["string"],
          "macros": {
            "calories": number,
            "protein_g": number,
            "carbs_g": number,
            "fat_g": number
          },
          "prepTimeMinutes": number,
          "instructions": "string"
        },
        "Lunch": { ...same structure... },
        "Dinner": { ...same structure... }
      }
    }
  ],
  "shoppingList": [
    {
      "item": "string",
      "quantity": "string",
      "category": "string"
    }
  ]
}

IMPORTANT:
- Return exactly 7 days.
- No extra commentary or markdown.
- JSON must be valid and parseable.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        top_p: 0.9,
        response_format: {
          type: 'json_object',
        },
      });

      const text = response.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('Meal plan generation returned empty content.');
      }
      return plannerUtils.parseResponse(text, WeeklyMealPlanSchema);
    } catch (error) {
      this.logger.error('OpenAI Meal Plan Generation Failed:', error);
      throw new Error('Meal plan generation failed. Please try again.');
    }
  }

  async generateText(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, // Higher temp for more "insightful" creative writing
      });

      return response.choices[0].message.content || 'No insights available.';
    } catch (error) {
      this.logger.error('OpenAI Text Generation Failed:', error.message);
      return 'Failed to generate AI insights.';
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

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<any> {
    const base64Image = imageBuffer.toString('base64');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert vision model. Always respond with strict JSON only.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`, // ✅ Correct shape
                },
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      });

      const raw = response.choices?.[0]?.message?.content;
      if (!raw) throw new Error('Empty response from OpenAI Vision API');

      const parsed = this.parseResponse(raw);
      return parsed;
    } catch (error: any) {
      this.logger.error(
        'OpenAI Vision Analysis Failed:',
        error?.response?.data ?? error,
      );
      throw new Error('Vision analysis failed');
    }
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

  async generateRecipes(
    ingredients: string[],
    allergies: string,
    userContext: string,
  ): Promise<Recipe[]> {
    const systemPrompt = `
        ROLE: Creative Chef.
        TASK: Suggest 3 distinct recipes using primarily these ingredients: ${ingredients.join(', ')}.
        CONTEXT: Allergies to AVOID: ${allergies}. User Notes: ${userContext}.
        OUTPUT FORMAT: STRICT JSON Array of 3 Recipe objects following the schema.
        `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate 3 recipes.' },
      ],
      response_format: {
        type: 'json_object',
      },
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Meal plan generation returned empty content.');
    }

    return plannerUtils.parseResponse(text, z.array(RecipeSchema));
  }

  async modifyRecipe(
    originalRecipe: string,
    modificationRequest: string,
  ): Promise<Recipe> {
    const systemPrompt = `
        ROLE: Creative Chef.
        TASK: Modify the recipe below based on this request: "${modificationRequest}".
        ORIGINAL RECIPE: ${originalRecipe}
        CRITICAL: Maintain the original essence but adapt ingredients/steps. Re-calculate macros.
        OUTPUT: Strict JSON matching the Recipe Schema.
        `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Modify the recipe' },
      ],
      response_format: {
        type: 'json_object',
      },
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Meal plan generation returned empty content.');
    }

    return plannerUtils.parseResponse(text, RecipeSchema);
  }

  async generateShoppingList(prompt: string): Promise<ShoppingListItem[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate a shopping list' },
      ],
      response_format: {
        type: 'json_object',
      },
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Meal plan generation returned empty content.');
    }

    return plannerUtils.parseResponse(text, z.array(ShoppingItemSchema));
  }
}
