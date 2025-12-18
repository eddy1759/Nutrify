import { MacroNutrients } from '../types/nutrition.types';

export const NutritionCalculator = {
  calculateBMR(
    weight: number,
    height: number,
    age: number,
    gender: 'male' | 'female',
  ): number {
    const base = 10 * weight * 6.25 * height - 5 * age;
    return gender === 'male' ? base + 5 : base - 161;
  },

  calculateTDEE(
    bmr: number,
    activityLevel:
      | 'sedentary'
      | 'light'
      | 'moderate'
      | 'active'
      | 'very_active',
  ): number {
    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };
    return Math.round(bmr * (activityMultipliers[activityLevel] || 1.2));
  },

  sumMacros(items: MacroNutrients[]): MacroNutrients {
    return items.reduce(
      (acc, curr) => ({
        calories: acc.calories + curr.calories,
        protein: acc.protein + curr.protein,
        carbs: acc.carbs + curr.carbs,
        fat: acc.fat + curr.fat,
        fiber: (acc.fiber || 0) + (curr.fiber || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );
  },

  // Helper to safely parse LLM JSON responses
  parseJSON(text: string): any {
    try {
      let clean = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first >= 0 && last >= 0) clean = clean.substring(first, last + 1);
      return JSON.parse(clean);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return null;
    }
  },
};
