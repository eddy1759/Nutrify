import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LlmLanguageProvider } from '../llm-core/llm.provider';
import { PrismaService } from '../common/prisma/prisma.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { WeeklyMealPlan } from './types/nutrition.types';

@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);
  constructor(
    private readonly llm: LlmLanguageProvider,
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
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
        planData: plan as any,
      },
    });

    this.amqpConnection
      .publish('nutrify.events', 'user.plan_created', {
        userId,
        timestamp: new Date(),
      })
      .catch((e) => this.logger.error('Failed to emit plan event', e));

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
}
