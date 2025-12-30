import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  BadRequestException,
  Query,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AtGuard } from '../../auth/guard/at.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NutritionistAgent } from '../nutritionist.agent';
import { MealType } from '../types/nutrition.types';

@Controller('agents/calories') // Base route: /agents/calories
@UseGuards(AtGuard)
export class NutritionController {
  constructor(private readonly nutritionist: NutritionistAgent) {}

  @Post('analyze') // -> /agents/calories/analyze
  @UseInterceptors(FileInterceptor('image'))
  async analyzeMeal(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { mealType: string; context?: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('Image is required');

    const validTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    const type = validTypes.includes(body.mealType) ? body.mealType : 'Snack';

    return this.nutritionist.estimateCalories(
      userId,
      type as MealType,
      file.buffer,
      body.context,
    );
  }

  @Post('confirm')
  async confirmLog(
    @CurrentUser('id') userId: string,
    @Body('logId') logId: string,
    @Body('overrides') overrides?: any,
  ) {
    return this.nutritionist.confirmMealLog(userId, logId, overrides);
  }

  @Get('summary') // -> /agents/calories/summary
  async getDailySummary(
    @CurrentUser('id') userId: string,
    @Query('date') dateString: string,
  ) {
    return this.nutritionist.getDailyCalorySummary(userId, dateString);
  }

  @Get(':id')
  async getMealLog(@Param('id') id: string) {
    return this.nutritionist.getNutritonProduct(id);
  }
}
