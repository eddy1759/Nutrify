// ================= TYPES =================

type KeywordRule =
  | { type: 'any'; words: string[] }
  | { type: 'all'; words: string[] };

export type RecipeImageCategory = {
  keywords: KeywordRule[];
  image: string;
  weight?: number;
};

// ================= DATA =================

export const IMAGE_CATEGORIES: RecipeImageCategory[] = [
  {
    keywords: [{ type: 'any', words: ['jollof', 'ofada', 'nigerian'] }],
    image:
      'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=800&q=80',
    weight: 6,
  },
  {
    keywords: [{ type: 'any', words: ['egusi', 'ogbono', 'okra'] }],
    image:
      'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=800&q=80',
    weight: 6,
  },
  {
    keywords: [{ type: 'any', words: ['suya'] }],
    image:
      'https://images.unsplash.com/photo-1630918234935-5c3a3b4f92a7?w=800&q=80',
    weight: 6,
  },
  {
    keywords: [
      { type: 'all', words: ['fried', 'rice'] },
      { type: 'all', words: ['nigerian', 'fried'] },
    ],
    image:
      'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800&q=80',
    weight: 5,
  },
  {
    keywords: [{ type: 'any', words: ['chicken'] }],
    image:
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80',
    weight: 3,
  },
  {
    keywords: [{ type: 'any', words: ['beef', 'steak'] }],
    image:
      'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&q=80',
    weight: 3,
  },
  {
    keywords: [{ type: 'any', words: ['fish', 'salmon', 'tilapia'] }],
    image:
      'https://images.unsplash.com/photo-1519708227418-c8fd9a3a2750?w=800&q=80',
    weight: 3,
  },
  {
    keywords: [{ type: 'any', words: ['pasta', 'spaghetti', 'noodles'] }],
    image:
      'https://images.unsplash.com/photo-1551183053-bf91b1d585ae?w=800&q=80',
    weight: 2,
  },
  {
    keywords: [{ type: 'any', words: ['rice', 'bowl'] }],
    image:
      'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=80',
    weight: 2,
  },
  {
    keywords: [{ type: 'any', words: ['salad', 'vegan', 'vegetarian'] }],
    image:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80',
    weight: 2,
  },
  {
    keywords: [{ type: 'any', words: ['breakfast', 'egg', 'omelette'] }],
    image:
      'https://images.unsplash.com/photo-1525351462161-f4b9aaaad365?w=800&q=80',
    weight: 2,
  },
];

// ================= HELPERS =================

export function normalizeRecipeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

export function isChickenRiceDish(tokens: string[]): boolean {
  const set = new Set(tokens);
  return (
    set.has('chicken') &&
    set.has('rice') &&
    (set.has('garlic') || set.has('lemon'))
  );
}

export function getDeterministicGenericImage(seed: string): string {
  const genericImages = [
    'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80',
    'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return genericImages[Math.abs(hash) % genericImages.length];
}
