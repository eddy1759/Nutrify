import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Param,
  Delete,
} from '@nestjs/common';
import { AtGuard } from '../../auth/guard/at.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RecipeAgent } from '../recipe.agent';
import { Recipe } from '../types/nutrition.types';

@Controller('agents/recipes')
@UseGuards(AtGuard)
export class RecipeController {
  constructor(private readonly recipe: RecipeAgent) {}

  @Post('suggest')
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

  @Post('modify')
  async modifyRecipe(@Body() body: { recipe: any; request: string }) {
    const recipeStr =
      typeof body.recipe === 'string'
        ? body.recipe
        : JSON.stringify(body.recipe);

    const modified = await this.recipe.modifyRecipe(recipeStr, body.request);

    return { success: true, data: modified };
  }

  @Post('save')
  async saveRecipe(
    @CurrentUser('id') userId: string,
    @Body() body: { recipe: Recipe },
  ) {
    return this.recipe.logToDB(userId, body.recipe);
  }

  @Get('cookbook')
  async getCookbook(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('difficulty') difficulty?: string,
    @Query('tag') tag?: string,
    @Query('sort') sort?: 'newest' | 'oldest' | 'a-z',
  ) {
    return this.recipe.getCookbook(userId, {
      page,
      limit,
      search,
      difficulty,
      tag,
      sort,
    });
  }

  @Get('cookbook/:id')
  async getRecipeById(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.recipe.getRecipeDetail(userId, id);
  }

  @Delete('cookbook/:id')
  async deleteRecipe(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.recipe.deleteRecipe(userId, id);
  }
}
