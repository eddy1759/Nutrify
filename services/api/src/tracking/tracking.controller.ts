import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsNumber, Min, Max } from 'class-validator';

class LogWaterDto {
  @IsNumber() @Min(1) @Max(5000) amount: number;
}
class LogWeightDto {
  @IsNumber() @Min(20) @Max(500) weight: number;
}

@Controller('tracking')
@UseGuards(AtGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('water')
  logWater(@CurrentUser('id') userId: string, @Body() dto: LogWaterDto) {
    return this.trackingService.logWater(userId, dto.amount);
  }

  @Post('weight')
  logWeight(@CurrentUser('id') userId: string, @Body() dto: LogWeightDto) {
    return this.trackingService.logWeight(userId, dto.weight);
  }

  @Get('today')
  getToday(@CurrentUser('id') userId: string) {
    return this.trackingService.getDailySummary(userId);
  }
}
