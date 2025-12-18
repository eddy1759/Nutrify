// planner.agent.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { PrismaService } from '../common/prisma/prisma.service';
// Import the type, not the Zod schema
import { WeeklyMealPlan } from './types/nutrition.types';
// Import the utils object which contains the schema for validation (if needed later)
// import { plannerUtils } from '../planner/planner.utils';

@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);
  constructor(
    private readonly llm: LlmLanguageProvider,
    private readonly prisma: PrismaService,
  ) {}

  async generateWeeklyPlan(
    userId: string,
    userPrefs: string,
  ): Promise<WeeklyMealPlan> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { allergies: true },
    });

    const allergies = user?.allergies?.join(', ') || 'None';

    const plan: WeeklyMealPlan = await this.llm.generateWeeklyMealPlan(
      userPrefs,
      allergies,
    );

    await this.prisma.mealPlan.create({
      data: {
        userId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        planData: plan as any, // Store the full JSON (Casting to any is fine here for Prisma)
      },
    });

    return plan;
  }

  async latestPlan(userId: string) {
    return this.prisma.mealPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async shoppingList(shoppingId: string) {
    const plan = await this.prisma.mealPlan.findUnique({
      where: { id: shoppingId },
    });
    if (!plan) throw new BadRequestException('Plan not found');
    const data = plan.planData as any;
    return { list: data.shoppingList };
  }

  // Method to re-generate just the shopping list if the user edits the plan manually
  // async refreshShoppingList(planId: string) {
  //   // Logic to pull plan, re-run just the shopping list aggregation via LLM or Rule-based
  // }
}
