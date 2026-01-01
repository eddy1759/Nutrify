import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { PrismaService } from '../common/prisma/prisma.service';
import { Recipe } from './types/nutrition.types';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RedisService } from '../common/redis/redis.service';
import { createHash } from 'crypto';
import {
  IMAGE_CATEGORIES,
  isChickenRiceDish,
  getDeterministicGenericImage,
  normalizeRecipeName,
} from './utils/recipe.utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class RecipeAgent {
  private readonly logger = new Logger(RecipeAgent.name);
  private readonly CACHE_TTL = 3600;

  constructor(
    private readonly llm: LlmLanguageProvider,
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
    private readonly redis: RedisService,
  ) {}

  async suggestRecipes(
    userId: string,
    ingredients: string[],
    userContext: string = '',
  ): Promise<Recipe[]> {
    if (ingredients.length === 0)
      throw new BadRequestException('Ingredients required');
    if (ingredients.length > 20)
      throw new BadRequestException('Too many ingredients');
    if (userContext.length > 200)
      throw new BadRequestException('Context too long');

    const normalizedKey = ingredients.sort().join(',').toLowerCase();
    const hash = createHash('sha256')
      .update(`${normalizedKey}:${userContext}`)
      .digest('hex');
    const cacheKey = `recipe_suggest:${userId}:${hash}`;

    const cached = await this.redis.get<Recipe[]>(cacheKey);
    if (cached) {
      this.logger.log(`Returning cached recipes for ${userId}`);
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { allergies: true },
    });
    const allergies = user?.allergies?.join(', ') || 'None';

    const recipes = await this.llm.generateRecipes(
      ingredients,
      allergies,
      userContext,
    );

    const enrichedRecipes = await Promise.all(
      recipes.map(async (recipe) => {
        const imageUrl = await this.fetchRecipeImage(recipe.recipeName);
        return { ...recipe, imageUrl };
      }),
    );

    if (enrichedRecipes.length > 0) {
      await this.redis.set(cacheKey, enrichedRecipes, this.CACHE_TTL);
    }

    return enrichedRecipes;
  }

  async modifyRecipe(
    originalRecipe: string,
    modificationRequest: string,
  ): Promise<Recipe> {
    if (!originalRecipe || !modificationRequest) {
      throw new BadRequestException('Recipe and modification request required');
    }

    const recipeStr =
      typeof originalRecipe === 'string'
        ? originalRecipe
        : JSON.stringify(originalRecipe);

    return this.llm.modifyRecipe(recipeStr, modificationRequest);
  }

  async logToDB(userId: string, recipe: Recipe) {
    try {
      if (!recipe.recipeName || !recipe.ingredients) {
        throw new BadRequestException('Invalid recipe structure');
      }

      const saved = await this.prisma.savedRecipe.create({
        data: {
          userId,
          name: recipe.recipeName,
          data: {
            ...(recipe as any),
            imageUrl: recipe.imageUrl ?? null,
          },
        },
      });

      this.amqpConnection
        .publish('nutrify.events', 'user.recipe_saved', {
          userId,
          recipeId: saved.id,
          recipeName: recipe.recipeName,
          timestamp: new Date(),
        })
        .catch((e) => this.logger.error('Failed to emit recipe event', e));

      return {
        success: true,
        message: 'Recipe saved to cookbook',
        id: saved.id,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error('Database error saving recipe', error);
      throw new InternalServerErrorException('Could not save recipe');
    }
  }

  async getCookbook(
    userId: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      difficulty?: string;
      tag?: string;
      sort?: 'newest' | 'oldest' | 'a-z';
    },
  ) {
    const { page = 1, limit = 10, search, difficulty, tag, sort } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.SavedRecipeWhereInput = {
      userId,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (difficulty) {
      where.data = {
        path: ['difficulty'],
        equals: difficulty, // matches "Easy", "Medium", "Hard" inside JSON
      };
    }

    if (tag) {
      where.data = {
        path: ['tags'],
        array_contains: tag,
      };
    }

    let orderBy: Prisma.SavedRecipeOrderByWithRelationInput = {
      createdAt: 'desc',
    };
    if (sort === 'oldest') orderBy = { createdAt: 'asc' };
    if (sort === 'a-z') orderBy = { name: 'asc' };

    // 3. Fetch Data & Count
    const [recipes, total] = await Promise.all([
      this.prisma.savedRecipe.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          data: true,
          createdAt: true,
        },
      }),
      this.prisma.savedRecipe.count({ where }),
    ]);

    // 4. Flatten Structure for Frontend
    // Instead of returning { data: { ...fields } }, we merge them for easier consumption
    const flattened = recipes.map((r) => {
      const details = r.data as unknown as Recipe;
      return {
        id: r.id,
        recipeName: r.name,
        description: details.description,
        difficulty: details.difficulty,
        prepTimeMinutes: details.prepTimeMinutes,
        cookTimeMinutes: details.cookTimeMinutes,
        tags: details.tags,
        imageUrl: details.imageUrl ?? null,
        savedAt: r.createdAt,
      };
    });

    return {
      data: flattened,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getRecipeDetail(userId: string, recipeId: string) {
    // findFirst with userId ensures user can only see THEIR OWN recipes
    const recipe = await this.prisma.savedRecipe.findFirst({
      where: { id: recipeId, userId },
    });

    if (!recipe) {
      throw new NotFoundException('Recipe not found in your cookbook');
    }

    // Return the full JSON data along with metadata
    return {
      id: recipe.id,
      ...(recipe.data as unknown as Recipe),
      savedAt: recipe.createdAt,
    };
  }

  async deleteRecipe(userId: string, recipeId: string) {
    // 1. Verify existence AND ownership
    // We use findFirst ensures we only find it if it belongs to THIS user
    const recipe = await this.prisma.savedRecipe.findFirst({
      where: {
        id: recipeId,
        userId: userId,
      },
    });

    if (!recipe) {
      throw new NotFoundException('Recipe not found in your cookbook');
    }

    // 2. Perform Hard Delete
    await this.prisma.savedRecipe.delete({
      where: { id: recipeId },
    });

    // 3. Optional: Emit event (if you want to track deletions for analytics)
    this.amqpConnection
      .publish('nutrify.events', 'user.recipe_deleted', {
        userId,
        recipeId,
        timestamp: new Date(),
      })
      .catch((e) => this.logger.error('Failed to emit delete event', e));

    return { success: true, message: 'Recipe removed from cookbook' };
  }

  private async fetchRecipeImage(recipeName: string): Promise<string> {
    try {
      /*
      const response = await axios.get(`https://api.unsplash.com/search/photos`, {
        params: { query: recipeName, per_page: 1, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
      });
      return response.data.results[0]?.urls?.small || this.getFallbackImage(recipeName);
      */

      // This maps common words in the recipe name to specific high-res placeholders
      return this.resolveFallbackImage(recipeName);
    } catch (error) {
      this.logger.warn(`Failed to fetch image for ${recipeName}`, error);
      return this.resolveFallbackImage(recipeName);
    }
  }

  private resolveFallbackImage(recipeName: string): string {
    const tokens = normalizeRecipeName(recipeName);
    const tokenSet = new Set(tokens);

    // 🔥 Hard override for known compound dishes
    if (isChickenRiceDish(tokens)) {
      return 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80';
    }

    let bestMatch: { score: number; image: string } | null = null;

    for (const category of IMAGE_CATEGORIES) {
      let score = 0;

      for (const rule of category.keywords) {
        let matched = false;

        if (rule.type === 'any') {
          matched = rule.words.some((w) => tokenSet.has(w));
        } else if (rule.type === 'all') {
          matched = rule.words.every((w) => tokenSet.has(w));
        }

        if (matched) {
          score += category.weight ?? 1;
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { score, image: category.image };
      }
    }

    return bestMatch
      ? bestMatch.image
      : getDeterministicGenericImage(recipeName);
  }
}
