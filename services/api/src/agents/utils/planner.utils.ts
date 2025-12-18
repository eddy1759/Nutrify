// import { z } from 'zod';

// export const MacrosSchema = z.object({
//   // RENAMED to match the JSON Schema Keys (gemini-analysis.schema.ts)
//   proteinGrams: z.number().nonnegative(),
//   fatGrams: z.number().nonnegative(),
//   carbGrams: z.number().nonnegative(),
//   caloriesKcal: z.number().int().nonnegative(),
// });

// export const MealSchema = z.object({
//   name: z.string(),
//   description: z.string(),
//   ingredients: z.array(z.string()),
//   macros: MacrosSchema, // Uses the renamed MacrosSchema
//   prepTimeMinutes: z.number().int().nonnegative(),
//   instructions: z.string(),
//   cuisineStyle: z.string().optional(), // Added for consistency
// });

// export const DaySchema = z.object({
//   day: z.enum([
//     // Using enum for strictness
//     'Monday',
//     'Tuesday',
//     'Wednesday',
//     'Thursday',
//     'Friday',
//     'Saturday',
//     'Sunday',
//   ]),
//   dailyCalorieEstimate: z.number().int().nonnegative(), // Added for consistency
//   meals: z.object({
//     Breakfast: MealSchema,
//     Lunch: MealSchema,
//     Dinner: MealSchema,
//     Snack: MealSchema.optional(), // Snack is optional in the Zod schema, ensure it is handled in the LLM prompt.
//   }),
// });

// export const ShoppingItemSchema = z.object({
//   item: z.string(),
//   quantity: z.string(),
//   category: z.string(),
// });

// export const WeeklyMealPlanSchema = z.object({
//   weeklySummary: z.string(),
//   days: z.array(DaySchema).length(7),
//   shoppingList: z.array(ShoppingItemSchema),
// });

// // Export TypeScript type:
// export type WeeklyMealPlan = z.infer<typeof WeeklyMealPlanSchema>;

// export const plannerUtils = {
//   parseResponse<T>(text: string, schema: z.ZodSchema<T>): T {
//     try {
//       const trimmed = text.trim();

//       // With response_format=json_object, the output **is JSON**, no code fences.
//       const parsed = JSON.parse(trimmed);

//       const validated = schema.parse(parsed); // Zod throws on invalid shape

//       return validated;
//     } catch (error: any) {
//       console.error('AI Parsing/Validation Failed:', error.message);
//       throw new Error('Invalid AI output format.');
//     }
//   },
// };

import { z } from 'zod';

// 1. MATCH KEYS EXACTLY (calories, protein, fat, carbs)
export const MacrosSchema = z.object({
  protein: z.number().min(0),
  fat: z.number().min(0),
  carbs: z.number().min(0),
  calories: z.number().min(0),
});

export const MealSchema = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(z.string()),
  macros: MacrosSchema, // Uses the matched schema
  prepTimeMinutes: z.number().min(0),
  instructions: z.string(),
  cuisineStyle: z.string().optional().default('General'),
});

export const DaySchema = z.object({
  day: z.enum([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]),
  dailyCalorieEstimate: z.number().min(0),
  meals: z.object({
    Breakfast: MealSchema,
    Lunch: MealSchema,
    Dinner: MealSchema,
    // 2. Allow Snack to be optional/nullable just in case AI skips it
    Snack: MealSchema.optional().or(z.null()),
  }),
});

// 3. STRICT CATEGORY ENUMS
export const ShoppingItemSchema = z.object({
  item: z.string(),
  quantity: z.string(),
  category: z.enum(['Produce', 'Meat', 'Dairy', 'Pantry', 'Frozen', 'Other']),
});

export const WeeklyMealPlanSchema = z.object({
  weeklySummary: z.string(),
  days: z.array(DaySchema).length(7),
  shoppingList: z.array(ShoppingItemSchema),
});

export type WeeklyMealPlan = z.infer<typeof WeeklyMealPlanSchema>;

export const plannerUtils = {
  parseResponse<T>(text: string, schema: z.ZodSchema<T>): T {
    try {
      const trimmed = text.trim();
      const parsed = JSON.parse(trimmed);
      return schema.parse(parsed);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        // Log deep error details so you can see exactly which field failed
        console.error(
          'Zod Validation Failed:',
          JSON.stringify(error.format(), null, 2),
        );
      } else {
        console.error('JSON Parse Failed:', error.message);
      }
      throw new Error('Invalid AI output format.');
    }
  },
};
