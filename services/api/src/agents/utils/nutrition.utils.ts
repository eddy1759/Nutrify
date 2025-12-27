import {
  CalorieAnalysisResult,
  CalorieAnalysisSchema,
  MacroNutrients,
  MealType,
} from '../types/nutrition.types';

const COMMON_FOODS_DB: Record<string, MacroNutrients> = {
  // Proteins
  'chicken breast': { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  'salmon fillet': { calories: 208, protein: 20, carbs: 0, fat: 13 },
  'ground beef': { calories: 250, protein: 26, carbs: 0, fat: 15 },
  egg: { calories: 78, protein: 6, carbs: 0.6, fat: 5 },
  tofu: { calories: 76, protein: 8, carbs: 1.9, fat: 4.8 },

  // Carbs
  'white rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  'brown rice': { calories: 112, protein: 2.6, carbs: 24, fat: 0.9 },
  pasta: { calories: 131, protein: 5, carbs: 25, fat: 1.1 },
  'sweet potato': { calories: 86, protein: 1.6, carbs: 20, fat: 0.1 },
  oatmeal: { calories: 68, protein: 2.4, carbs: 12, fat: 1.4 },

  // Vegetables
  broccoli: { calories: 34, protein: 2.8, carbs: 7, fat: 0.4 },
  spinach: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  carrot: { calories: 41, protein: 0.9, carbs: 10, fat: 0.2 },

  // Fruits
  banana: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  apple: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 },

  // Dairy
  'greek yogurt': { calories: 100, protein: 17, carbs: 6, fat: 0.7 },
  'whole milk': { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
  'cheddar cheese': { calories: 403, protein: 25, carbs: 1.3, fat: 33 },
};

export const NutritionUtils = {
  generatePrompt(context?: string, mealType?: MealType): string {
    return `
      ROLE: You are a certified expert nutritionist Agent with comprehensive knowledge of food composition databases (USDA, NCCDB).
      TASK: Analyze the image and provide strict nutritional data.
      
      CONTEXT: 
      ${mealType ? `- Meal Type: ${mealType}` : ''}
      ${context ? `- User Notes: ${context}` : ''}

      CRITICAL RULES:
      1. RETURN JSON ONLY. No Markdown.
      2. IDENTIFY all visible food items
      3. ESTIMATE macros for the *entire visible portion* using standard serving sizes and your training data
      4. CALCULATE total meal nutrition by summing all components
      5. ASSESS confidence level based on image clarity and food visibility
      6. PROVIDE healthier alternatives if the meal is calorie-dense

      IMPORTANT GUIDELINES:
      1. MACROS MUST BE NUMBERS. (e.g. 30, not "30g").
      2. Consider hidden calories (sauces, oils, dressings)
      3. CONFIDENCE SCORE:
         - 0.9-1.0: Crystal clear image, standard food.
         - 0.7-0.9: Good visibility, minor uncertainty on sauce/cooking method.
         - < 0.7: Blurry, mixed stew, or unidentifiable.
      4. Be conservative - better to slightly overestimate than underestimate

      JSON STRUCTURE:
      {
        "foodName": "string",
        "servingSize": "string",
        "macros": { "calories": number, "protein": number, "carbs": number, "fat": number },
        "confidence": number (0.0 - 1.0),
        "explanation": "string",
        "suggestions": ["Optional healthier alternatives or tips"],
        "alternativeFoods": [
            {
                "name": "string",
                "servingSize": "string",
                "macros": { "calories": number, "protein": number, "carbs": number, "fat": number },
                "category": "protein|carbohydrate|vegetable|etc"
            }
        ]
      }
    `;
  },

  parseResponse(text: string): CalorieAnalysisResult | null {
    try {
      // Sanitize Markdown wrappers
      let jsonString = text.trim();

      // Remove markdown code blocks if present
      const codeBlockMatch = jsonString.match(
        /```(?:json)?\s*([\s\S]*?)\s*```/,
      );
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1].trim();
      }

      // Extract JSON object
      const startIndex = jsonString.indexOf('{');
      const endIndex = jsonString.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        console.error('No valid JSON object found in response');
        return null;
      }

      jsonString = jsonString.substring(startIndex, endIndex + 1);

      // Sanitize JSON string (handle unescaped newlines in strings)
      jsonString = this.sanitizeJsonString(jsonString);

      const parsed = JSON.parse(jsonString);

      ['calories', 'protein', 'carbs', 'fat'].forEach((key) => {
        if (parsed.macros && typeof parsed.macros[key] === 'string') {
          parsed.macros[key] = parseFloat(
            parsed.macros[key].replace(/[^0-9.]/g, ''),
          );
        }
      });

      return CalorieAnalysisSchema.parse(parsed);
    } catch (e) {
      console.warn('AI Parsing Failed:', e.message);
      return null;
    }
  },

  sanitizeJsonString(jsonString: string): string {
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
  },

  getFallback(text: string): CalorieAnalysisResult {
    const lowerText = text.toLowerCase();

    // "Best Match" Logic (avoids summing "Chicken" + "Pizza" for "Chicken Pizza")
    const match = Object.keys(COMMON_FOODS_DB)
      .filter((k) => lowerText.includes(k))
      .sort((a, b) => b.length - a.length)[0]; // Longest match wins

    if (match) {
      return {
        foodName: match.charAt(0).toUpperCase() + match.slice(1),
        servingSize: 'Standard Serving',
        macros: COMMON_FOODS_DB[match],
        confidence: 0.5, // Low confidence for fallbacks
        explanation: 'Automated fallback based on keyword match.',
        suggestions: ['Please edit details if incorrect.'],
        alternativeFoods: [],
      };
    }

    return {
      foodName: 'Unknown Food',
      servingSize: '?',
      macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      confidence: 0.1,
      explanation: 'Could not identify food.',
      suggestions: [],
      alternativeFoods: [],
    };
  },
};
