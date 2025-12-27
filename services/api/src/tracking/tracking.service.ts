import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { startOfDay } from 'date-fns';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  /**
   * Log Water Intake (Idempotent-ish: increments value)
   */
  async logWater(userId: string, amountMl: number) {
    const today = startOfDay(new Date());

    const log = await this.prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId,
        date: today,
        waterMl: amountMl,
      },
      update: {
        waterMl: { increment: amountMl },
      },
    });

    // Fire Event for Gamification (Badges) & Notifications
    await this.emitEvent('user.logged_water', {
      userId,
      totalToday: log.waterMl,
      addedAmount: amountMl,
    });

    return log;
  }

  /**
   * Log Weight (Updates Profile + Daily History)
   */
  async logWeight(userId: string, weightKg: number) {
    const today = startOfDay(new Date());

    // 1. Update Daily Log
    const log = await this.prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, weightKg },
      update: { weightKg },
    });

    // 2. Fire Event (Biometrics service should listen to this to update the Profile)
    await this.emitEvent('user.logged_weight', {
      userId,
      weightKg,
      date: today,
    });

    return log;
  }

  /**
   * Get Today's Status
   */
  async getDailySummary(userId: string) {
    const today = startOfDay(new Date());

    const log = await this.prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    return {
      water: log?.waterMl || 0,
      calories: log?.caloriesIn || 0,
      weight: log?.weightKg || null,
      loggedLogin: log?.didLogin || false,
    };
  }

  private async emitEvent(pattern: string, payload: any) {
    try {
      await this.amqpConnection.publish('nutrify.events', pattern, payload);
    } catch (e) {
      this.logger.error(`Failed to emit ${pattern}`, e);
    }
  }
}
