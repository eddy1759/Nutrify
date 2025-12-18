import { Schema, SchemaType } from '@google/generative-ai';

export const GEMINI_INGREDIENT_ANALYSIS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    productName: {
      type: SchemaType.STRING,
      description: 'The guessed product name.',
    },
    nutriScore: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['A', 'B', 'C', 'D', 'E'],
    },
    additives: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          function: { type: SchemaType.STRING },
          risk: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['Low', 'Medium', 'High', 'Unknown'],
          },
          explanation: { type: SchemaType.STRING },
        },
        required: ['name', 'function', 'risk', 'explanation'] as string[], // Cast required array
      },
    },
    cleanRecipe: {
      type: SchemaType.STRING,
      description: 'A practical home alternative recipe.',
    },
    functionalCategories: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    estimatedShelfLife: {
      type: SchemaType.STRING,
      description:
        'Estimated shelf life, e.g., "6 months" or "2 weeks refrigerated".',
    },
  },
  required: [
    'productName',
    'nutriScore',
    'additives',
    'cleanRecipe',
    'functionalCategories',
    'estimatedShelfLife',
  ] as string[], // Cast required array
} as const satisfies Schema;

// const MACROS_JSON_SCHEMA = {
//   type: 'object',
//   properties: {
//     proteinGrams: { type: 'number', description: 'Grams of Protein' },
//     fatGrams: { type: 'number', description: 'Grams of Fat' },
//     carbGrams: { type: 'number', description: 'Grams of Carbohydrates' },
//     caloriesKcal: { type: 'integer', description: 'Total Calories in Kcal' },
//   },
//   required: ['proteinGrams', 'fatGrams', 'carbGrams', 'caloriesKcal'],
// };

// const MEAL_DETAILS_JSON_SCHEMA = {
//   type: 'object',
//   properties: {
//     name: { type: 'string' },
//     description: {
//       type: 'string',
//       description: 'A brief, appetizing description.',
//     },
//     ingredients: { type: 'array', items: { type: 'string' } },
//     macros: MACROS_JSON_SCHEMA, // Nested schema
//     prepTimeMinutes: { type: 'integer' },
//     instructions: { type: 'string' },
//     cuisineStyle: {
//       type: 'string',
//       description: 'e.g., Italian, Mexican, Asian, American',
//     },
//   },
//   required: [
//     'name',
//     'description',
//     'ingredients',
//     'macros',
//     'prepTimeMinutes',
//     'instructions',
//   ],
// };

// const SHOPPING_ITEM_JSON_SCHEMA = {
//   type: 'object',
//   properties: {
//     item: { type: 'string' },
//     quantity: {
//       type: 'string',
//       description: 'e.g., 1kg, 2 heads, 6 large',
//     },
//     category: {
//       type: 'string',
//       description: 'e.g., Produce, Meat, Dairy, Pantry',
//     },
//   },
//   required: ['item', 'quantity', 'category'],
// };

// export const WEEKLY_PLAN_JSON_SCHEMA = {
//   type: 'object',
//   properties: {
//     weeklySummary: {
//       type: 'string',
//       description:
//         'Brief strategy explanation focusing on preferences and allergy avoidance.',
//     },
//     days: {
//       type: 'array',
//       items: {
//         type: 'object',
//         properties: {
//           day: {
//             type: 'string',
//             enum: [
//               'Monday',
//               'Tuesday',
//               'Wednesday',
//               'Thursday',
//               'Friday',
//               'Saturday',
//               'Sunday',
//             ],
//           },
//           dailyCalorieEstimate: {
//             type: 'integer',
//             description: 'Estimated total daily calories (Kcal).',
//           },
//           meals: {
//             type: 'object',
//             properties: {
//               Breakfast: MEAL_DETAILS_JSON_SCHEMA,
//               Lunch: MEAL_DETAILS_JSON_SCHEMA,
//               Dinner: MEAL_DETAILS_JSON_SCHEMA,
//               Snack: MEAL_DETAILS_JSON_SCHEMA,
//             },
//             required: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
//           },
//         },
//         required: ['day', 'dailyCalorieEstimate', 'meals'],
//       },
//     },
//     shoppingList: {
//       type: 'array',
//       items: SHOPPING_ITEM_JSON_SCHEMA,
//     },
//   },
//   required: ['weeklySummary', 'days', 'shoppingList'],
// };

const MACROS_JSON_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    protein: { type: SchemaType.NUMBER, description: 'Protein (g)' },
    fat: { type: SchemaType.NUMBER, description: 'Fat (g)' },
    carbs: { type: SchemaType.NUMBER, description: 'Carbs (g)' },
    calories: { type: SchemaType.NUMBER, description: 'Calories (kcal)' },
  },
  required: ['protein', 'fat', 'carbs', 'calories'], // <--- Strictly required
};

const MEAL_DETAILS_JSON_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING },
    ingredients: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    macros: MACROS_JSON_SCHEMA,
    prepTimeMinutes: { type: SchemaType.NUMBER },
    instructions: { type: SchemaType.STRING },
    cuisineStyle: { type: SchemaType.STRING },
  },
  required: [
    'name',
    'description',
    'ingredients',
    'macros',
    'prepTimeMinutes',
    'instructions',
  ],
};

// 2. SHOPPING LIST: Strict Enums to prevent invalid categories
const SHOPPING_ITEM_JSON_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    item: { type: SchemaType.STRING },
    quantity: { type: SchemaType.STRING },
    category: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['Produce', 'Meat', 'Dairy', 'Pantry', 'Frozen', 'Other'],
    },
  },
  required: ['item', 'quantity', 'category'],
};

export const WEEKLY_PLAN_JSON_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    weeklySummary: { type: SchemaType.STRING },
    days: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          day: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
              'Sunday',
            ],
          },
          dailyCalorieEstimate: { type: SchemaType.NUMBER },
          meals: {
            type: SchemaType.OBJECT,
            properties: {
              Breakfast: MEAL_DETAILS_JSON_SCHEMA,
              Lunch: MEAL_DETAILS_JSON_SCHEMA,
              Dinner: MEAL_DETAILS_JSON_SCHEMA,
              Snack: MEAL_DETAILS_JSON_SCHEMA,
            },
            required: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
          },
        },
        required: ['day', 'dailyCalorieEstimate', 'meals'],
      },
    },
    shoppingList: {
      type: SchemaType.ARRAY,
      items: SHOPPING_ITEM_JSON_SCHEMA,
    },
  },
  required: ['weeklySummary', 'days', 'shoppingList'],
} as const;

export const RECIPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recipeName: { type: 'string' },
    description: {
      type: 'string',
      description: 'A brief, appetizing description (max 300 chars).',
    },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
      description:
        'List of ingredients with quantities (e.g., "200g Chicken", "1 tsp Salt").',
    },
    instructions: { type: 'array', items: { type: 'string' } },
    prepTimeMinutes: { type: 'integer' },
    cookTimeMinutes: { type: 'integer' },
    difficulty: {
      type: 'string',
      enum: ['Easy', 'Medium', 'Hard'],
    },
    macrosPerServing: MACROS_JSON_SCHEMA,
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'e.g., "Gluten-Free", "High Protein"',
    },
  },
  required: [
    'recipeName',
    'description',
    'ingredients',
    'instructions',
    'prepTimeMinutes',
    'cookTimeMinutes',
    'difficulty',
    'macrosPerServing',
  ],
};

// --- Gemini SDK Schema (Derived from the JSON Schema) ---
const toGeminiSchema = (jsonSchema: any): Schema => {
  const {
    type,
    properties,
    items,
    required,
    enum: enumValues,
    ...rest
  } = jsonSchema;

  const geminiSchema: any = { type: SchemaType[type.toUpperCase()], ...rest };

  if (properties) {
    geminiSchema.properties = Object.fromEntries(
      Object.entries(properties).map(([key, propSchema]) => [
        key,
        toGeminiSchema(propSchema),
      ]),
    );
  }
  if (items) {
    geminiSchema.items = toGeminiSchema(items);
  }
  if (required) {
    geminiSchema.required = required as string[];
  }
  if (enumValues) {
    geminiSchema.enum = enumValues as string[];
    // Add format for string enums for Gemini SDK
    if (type === 'string') {
      geminiSchema.format = 'enum';
    }
  }

  return geminiSchema as Schema;
};

// Export the final Gemini SDK compliant schema
export const MEAL_PLAN_SCHEMA_GEMINI = toGeminiSchema(
  WEEKLY_PLAN_JSON_SCHEMA,
) satisfies Schema;

export const RECIPE_GEMINI_SCHEMA = toGeminiSchema(
  RECIPE_JSON_SCHEMA,
) satisfies Schema;

// --- Shopping List Schema for PlannerAgent ---
// const SHOPPING_ITEM_JSON_SCHEMA = {
//   // ... (existing definition from previous response)
// };

export const SHOPPING_LIST_JSON_SCHEMA = {
  type: 'array',
  items: SHOPPING_ITEM_JSON_SCHEMA,
};

export const SHOPPING_LIST_GEMINI_SCHEMA = toGeminiSchema(
  SHOPPING_LIST_JSON_SCHEMA,
) satisfies Schema;

// You still need to ensure GEMINI_INGREDIENT_ANALYSIS_SCHEMA is correct if it's used elsewhere.
// I will keep the existing correct definition for that one.
/*
export const GEMINI_INGREDIENT_ANALYSIS_SCHEMA = { ... }; 
*/
