import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LogWaterDto, LogWeightDto } from './dto/tracking.dto';

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
    return this.trackingService.logWeight(userId, dto.weight, dto.date);
  }

  @Get('today')
  getToday(@CurrentUser('id') userId: string) {
    return this.trackingService.getDailySummary(userId);
  }
}
