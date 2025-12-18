import { Controller, Post, Get, Body, UseGuards, Param } from '@nestjs/common';
import { AtGuard } from '../../auth/guard/at.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PlannerAgent } from '../planner.agent';

@Controller('agents/planner') // Base route: /agents/planner
@UseGuards(AtGuard)
export class PlannerController {
  constructor(private readonly planner: PlannerAgent) {}

  @Post('generate') // -> /agents/planner/generate
  async generatePlan(
    @Body() body: { preferences: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.planner.generateWeeklyPlan(userId, body.preferences);
  }

  @Get('latest') // -> /agents/planner/latest
  async getLatestPlan(@CurrentUser('id') userId: string) {
    return this.planner.latestPlan(userId);
  }

  @Get(':id/shopping-list') // -> /agents/planner/:id/shopping-list
  async getShoppingList(@Param('id') id: string) {
    return this.planner.shoppingList(id);
  }
}
