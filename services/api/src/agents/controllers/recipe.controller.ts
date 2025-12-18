import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AtGuard } from '../../auth/guard/at.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RecipeAgent } from '../recipe.agent';
import { Recipe } from '../types/nutrition.types';

@Controller('agents/recipes') // Base route: /agents/recipes
@UseGuards(AtGuard)
export class RecipeController {
  constructor(private readonly recipe: RecipeAgent) {}

  @Post('suggest') // -> /agents/recipes/suggest
  async suggestRecipes(
    @Body() body: { ingredients: string[]; context?: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!body.ingredients || body.ingredients.length === 0) {
      throw new BadRequestException('Ingredients list required');
    }

    const suggestions = await this.recipe.suggestRecipes(
      userId,
      body.ingredients,
      body.context,
    );

    return { success: true, count: suggestions.length, data: suggestions };
  }

  @Post('modify') // -> /agents/recipes/modify
  async modifyRecipe(@Body() body: { recipe: any; request: string }) {
    const recipeStr =
      typeof body.recipe === 'string'
        ? body.recipe
        : JSON.stringify(body.recipe);

    const modified = await this.recipe.modifyRecipe(recipeStr, body.request);

    return { success: true, data: modified };
  }

  @Post('save') // -> /agents/recipes/save
  async saveRecipe(
    @CurrentUser('id') userId: string,
    @Body() body: { recipe: Recipe },
  ) {
    return this.recipe.logToDB(userId, body.recipe);
  }
}
