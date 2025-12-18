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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AtGuard } from '../../auth/guard/at.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NutritionistAgent } from '../nutritionist.agent';
import { CalorieAnalysisResult, MealType } from '../types/nutrition.types';

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

  @Post('confirm') // -> /agents/calories/confirm
  async confirmLog(
    @Body() body: { data: CalorieAnalysisResult; mealType: MealType },
    @CurrentUser('id') userId: string,
  ) {
    return this.nutritionist.logToDatabase(userId, body.data, body.mealType);
  }

  @Get('summary') // -> /agents/calories/summary
  async getDailySummary(
    @CurrentUser('id') userId: string,
    @Query('date') dateString: string,
  ) {
    return this.nutritionist.getDailyCalorySummary(userId, dateString);
  }
}
