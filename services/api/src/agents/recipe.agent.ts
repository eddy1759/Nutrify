import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { PrismaService } from '../common/prisma/prisma.service';
import { Recipe } from './types/nutrition.types';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class RecipeAgent {
  private readonly logger = new Logger(RecipeAgent.name);

  constructor(
    private readonly llm: LlmLanguageProvider,
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  async suggestRecipes(
    userId: string,
    ingredients: string[],
    userContext: string = '',
  ): Promise<Recipe[]> {
    if (ingredients.length === 0) {
      throw new BadRequestException('Ingredients list required');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { allergies: true },
    });
    const allergies = user?.allergies?.join(', ') || 'None'; // 2. Delegate the LLM call to the provider, passing all necessary data

    return this.llm.generateRecipes(ingredients, allergies, userContext);
  }

  async modifyRecipe(
    originalRecipe: string,
    modificationRequest: string,
  ): Promise<Recipe> {
    return this.llm.modifyRecipe(originalRecipe, modificationRequest);
  }

  async logToDB(userId: string, recipe: Recipe) {
    try {
      await this.prisma.savedRecipe.create({
        data: {
          userId,
          name: recipe.recipeName,
          data: recipe as any,
        },
      });
      this.amqpConnection
        .publish('nutrify.events', 'user.recipe_saved', {
          userId,
          recipeName: recipe.recipeName,
        })
        .catch((e) => this.logger.error('Failed to emit recipe event', e));

      return { success: true, message: 'Recipe saved to cookbook' };
    } catch (error) {
      this.logger.error('An error occurred while saving recipe to db', error);
      throw new InternalServerErrorException(
        'An error occur persisting recipe',
      );
    }
  }
}
