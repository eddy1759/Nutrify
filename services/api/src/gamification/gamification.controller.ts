import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('gamification')
@UseGuards(AtGuard)
export class GamificationController {
  constructor(private readonly gameService: GamificationService) {}

  @Get('stats')
  getMyStats(@CurrentUser('id') userId: string) {
    return this.gameService.getUserStats(userId);
  }

  @Post('login') // Called on App Open
  triggerDailyLogin(@CurrentUser('id') userId: string) {
    return this.gameService.handleDailyLogin(userId);
  }

  @Get('leaderboard')
  getLeaderboard(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.gameService.getLeaderboard(limit || 30);
  }
}
