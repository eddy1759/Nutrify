import { Controller, Get, UseGuards } from '@nestjs/common';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AnalyticsService,
  DashboardData,
  AnalyticsData,
} from './analytics.service';

@Controller('analytics')
@UseGuards(AtGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard(
    @CurrentUser('id') userId: string,
  ): Promise<DashboardData> {
    return this.analyticsService.getDashboard(userId);
  }

  @Get('trends')
  async getTrends(@CurrentUser('id') userId: string): Promise<AnalyticsData> {
    return this.analyticsService.getAnalytics(userId);
  }

  @Get('ai-insights')
  async getInsights(@CurrentUser('id') userId: string) {
    return this.analyticsService.getAiInsights(userId);
  }
}
