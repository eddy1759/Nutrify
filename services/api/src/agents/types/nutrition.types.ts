import { z } from 'zod';

export const MacroSchema = z.object({
  calories: z.number().int().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  fiber: z.number().optional(),
  sugar: z.number().optional(),
  sodium: z.number().optional(),
});

export const CalorieAnalysisSchema = z.object({
  foodName: z.string().min(1).max(200),
  servingSize: z.string().default('1 serving'),
  macros: MacroSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string().max(2000),
  suggestions: z.array(z.string()).default([]),
  alternativeFoods: z
    .array(
      z.object({
        name: z.string(),
        macros: MacroSchema,
        category: z.string().optional(),
      }),
    )
    .default([]),
});

export type CalorieAnalysisResult = z.infer<typeof CalorieAnalysisSchema>;
export type MacroNutrients = z.infer<typeof MacroSchema>;

// --- API Response Enums ---

export enum AnalysisStatus {
  AUTO_LOGGED = 'AUTO_LOGGED', // Confidence > 0.9
  REQUIRES_REVIEW = 'REQUIRES_REVIEW', // Confidence < 0.7
  CONFIRMED = 'CONFIRMED', // Middle ground (0.7 - 0.9)
}

export interface NutritionResponse {
  status: AnalysisStatus;
  data: CalorieAnalysisResult;
  logId?: string; // Present if auto-logged (for Undo functionality)
  warningMessage?: string; // Present if confidence is low
}

export interface MicroNutrients {
  vitaminA?: number;
  vitaminC?: number;
  vitaminD?: number;
  calcium?: number;
  iron?: number;
  potassium?: number;
}

export interface FoodItem {
  name: string;
  servingSize: string;
  macros: MacroNutrients;
  micros?: MicroNutrients;
  category: FoodCategory;
}

export type FoodCategory =
  | 'protein'
  | 'carbohydrate'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'fat'
  | 'beverage'
  | 'snack'
  | 'mixed';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Meal {
  id: string;
  type: MealType;
  name: string;
  description?: string;
  foods: FoodItem[];
  totalMacros: MacroNutrients;
  preparationTime?: number; // minutes
  recipe?: string;
  imageUrl?: string;
}

export interface DailyMealPlan {
  date: string; // ISO date string
  dayOfWeek: string;
  meals: {
    breakfast: Meal;
    lunch: Meal;
    dinner: Meal;
    snacks: Meal[];
  };
  totalMacros: MacroNutrients;
  notes?: string;
}

// export interface WeeklyMealPlan {
//   id: string;
//   userId: string;
//   weekStartDate: string;
//   weekEndDate: string;
//   dailyPlans: DailyMealPlan[];
//   weeklyTotals: MacroNutrients;
//   shoppingList: ShoppingListItem[];
//   createdAt: Date;
//   updatedAt: Date;
// }

export interface ShoppingListItem {
  item: string;
  quantity: string;
  category: string;
}

export interface UserNutritionProfile {
  userId: string;
  age: number;
  weight: number; // kg
  height: number; // cm
  gender: 'male' | 'female' | 'other';
  activityLevel: ActivityLevel;
  goal: NutritionGoal;
  allergies: string[];
  dietaryRestrictions: DietaryRestriction[];
  dailyCalorieTarget?: number;
  dailyMacroTargets?: MacroNutrients;
}

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type NutritionGoal =
  | 'lose_weight'
  | 'maintain'
  | 'gain_muscle'
  | 'improve_health';

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'dairy_free'
  | 'keto'
  | 'paleo'
  | 'halal'
  | 'kosher'
  | 'low_sodium'
  | 'low_sugar';

export interface NutritionLog {
  id: string;
  userId: string;
  date: string;
  mealType: MealType;
  foodName: string;
  macros: MacroNutrients;
  imageUrl?: string;
  confidence: number;
  source: 'manual' | 'ai_scan' | 'barcode';
  createdAt: Date;
}

export interface DailyNutritionSummary {
  date: string;
  userId: string;
  targetMacros: MacroNutrients;
  consumedMacros: MacroNutrients;
  remainingMacros: MacroNutrients;
  percentageComplete: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  meals: NutritionLog[];
}

export interface MealPlanGenerationRequest {
  userId: string;
  profile: UserNutritionProfile;
  preferences?: string;
  numberOfDays: number;
  startDate?: string;
}

export interface MealPlanGenerationResult {
  success: boolean;
  plan?: WeeklyMealPlan;
  error?: string;
  processingTimeMs: number;
}

export const IngredientSchema = z.object({
  item: z.string(),
  quantity: z.string(),
  unit: z.string().optional(),
  category: z
    .enum(['Produce', 'Meat', 'Dairy', 'Pantry', 'Frozen', 'Other'])
    .default('Other'),
});

export const MealSchema = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(z.string()), // Simple list for display
  macros: MacroSchema,
  prepTimeMinutes: z.number(),
  instructions: z.string(),
});

export const DailyPlanSchema = z.object({
  day: z.string(), // "Monday"
  meals: z.object({
    Breakfast: MealSchema,
    Lunch: MealSchema,
    Dinner: MealSchema,
    Snack: MealSchema.optional(),
  }),
});

export const WeeklyPlanSchema = z.object({
  weeklySummary: z.string(),
  days: z.array(DailyPlanSchema),
  shoppingList: z.array(IngredientSchema),
});

export type WeeklyMealPlan = z.infer<typeof WeeklyPlanSchema>;

export const RecipeSchema = z.object({
  recipeName: z.string(),
  description: z.string().max(300),
  ingredients: z.array(z.string()), // Quantities included in string: "200g Chicken"
  instructions: z.array(z.string()),
  prepTimeMinutes: z.number(),
  cookTimeMinutes: z.number(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  macrosPerServing: MacroSchema, // Reusing your existing macro schema
  tags: z.array(z.string()).optional(), // e.g., ["Gluten-Free", "High Protein"]
});

export type Recipe = z.infer<typeof RecipeSchema>;
