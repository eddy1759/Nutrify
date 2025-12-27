import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { startOfDay, subDays, isSameDay } from 'date-fns';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);
  private readonly XP_PER_LEVEL = 1000;
  private readonly LEADERBOARD_CACHE_KEY = 'leaderboard:global';

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
    private readonly redis: RedisService,
  ) {}

  // ==================================================================
  // 👂 Event Listeners (Incoming)
  // ==================================================================

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.profile_updated',
    queue: 'gamification.profile',
  })
  async handleProfileComplete(payload: { userId: string; action: string }) {
    if (payload.action === 'CREATED') {
      await this.unlockBadge(payload.userId, 'profile_complete');
    }
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.logged_water',
    queue: 'gamification.water',
  })
  async handleWaterLog(payload: { userId: string; totalToday: number }) {
    await this.checkHydrationBadges(payload.userId, payload.totalToday);
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.scan_created',
    queue: 'gamification.scans',
  })
  async handleScan(payload: { userId: string }) {
    await this.awardXP(payload.userId, 50); // Scan XP reward
    await this.checkScanMilestones(payload.userId);
    await this.checkTimeBadges(payload.userId);
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.meal_logged',
    queue: 'gamification.meals',
  })
  async handleMealLog(payload: { userId: string }) {
    await this.awardXP(payload.userId, 30); // Meal Log XP reward
  }

  // ==================================================================
  // 🚀 Core Logic
  // ==================================================================

  // async handleDailyLogin(userId: string) {
  //   const user = await this.prisma.user.findUnique({ where: { id: userId } });
  //   if (!user) return null;

  //   const today = startOfDay(new Date());
  //   const lastLogin = user.lastLoginDate
  //     ? startOfDay(user.lastLoginDate)
  //     : null;

  //   if (lastLogin && lastLogin.getTime() === today.getTime()) {
  //     return { streak: user.currentLoginStreak, reward: 0, status: 'CLAIMED' };
  //   }

  //   let newStreak = 1;
  //   let status = 'RESET';

  //   if (lastLogin && differenceInCalendarDays(today, lastLogin) === 1) {
  //     newStreak = user.currentLoginStreak + 1;
  //     status = 'CONTINUED';
  //   }

  //   const xpReward = 25;
  //   const newTotalLogins = user.totalLogins + 1;

  //   await this.prisma.$transaction(async (tx) => {
  //     await tx.user.update({
  //       where: { id: userId },
  //       data: {
  //         lastLoginDate: new Date(),
  //         currentLoginStreak: newStreak,
  //         longestLoginStreak: Math.max(newStreak, user.longestLoginStreak),
  //         totalLogins: newTotalLogins,
  //         xp: { increment: xpReward },
  //       },
  //     });
  //     await tx.dailyLog.upsert({
  //       where: { userId_date: { userId, date: today } },
  //       create: { userId, date: today, didLogin: true },
  //       update: { didLogin: true },
  //     });
  //   });

  //   await this.checkLoginStreakBadges(userId, newStreak);
  //   await this.checkTotalLoginBadges(userId, newTotalLogins);
  //   return { streak: newStreak, reward: xpReward, status };
  // }

  async handleDailyLogin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const now = new Date();
    const today = startOfDay(now);

    if (user.lastLoginDate && isSameDay(new Date(user.lastLoginDate), today)) {
      this.logger.log(`User ${userId} already logged in today.`);
      return { streak: user.currentLoginStreak, reward: 0, status: 'CLAIMED' };
    }

    // Calculate Streak Logic
    let newStreak = 1;
    let status = 'RESET';

    // If last login was YESTERDAY, increment streak.
    // If it was older, reset to 1.
    const yesterday = subDays(today, 1);
    if (
      user.lastLoginDate &&
      isSameDay(new Date(user.lastLoginDate), yesterday)
    ) {
      newStreak = user.currentLoginStreak + 1;
      status = 'CONTINUED';
    } else {
      status = 'RESET'; // Gap detected
    }

    const xpReward = 25; // Base reward
    const newTotalLogins = user.totalLogins + 1;

    try {
      await this.prisma.$transaction(async (tx) => {
        // A. Update User Stats
        await tx.user.update({
          where: { id: userId },
          data: {
            lastLoginDate: now, // Save exact timestamp
            currentLoginStreak: newStreak,
            longestLoginStreak: Math.max(newStreak, user.longestLoginStreak),
            totalLogins: { increment: 1 }, // Robust increment
            xp: { increment: xpReward },
          },
        });

        // B. Create/Update Daily Log Entry
        // This is crucial for your charts/history
        await tx.dailyLog.upsert({
          where: {
            userId_date: {
              userId: userId,
              date: today, // Ensure this matches the unique constraint in Prisma Schema
            },
          },
          create: {
            userId,
            date: today,
            didLogin: true,
          },
          update: {
            didLogin: true, // If it exists (rare), ensure it's true
          },
        });
      });

      this.logger.log(
        `✅ Login processed: Streak ${newStreak}, Status: ${status}`,
      );
    } catch (error) {
      this.logger.error(`Failed to process daily login: ${error.message}`);
      throw error;
    }

    // 4. Check Badges (Async - don't block response)
    this.checkLoginStreakBadges(userId, newStreak);
    this.checkTotalLoginBadges(userId, newTotalLogins);

    return { streak: newStreak, reward: xpReward, status };
  }

  async awardXP(userId: string, amount: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const newXp = user.xp + amount;
    const newLevel = Math.floor(newXp / this.XP_PER_LEVEL) + 1;

    await this.prisma.user.update({
      where: { id: userId },
      data: { xp: newXp, level: newLevel },
    });

    if (newLevel > user.level) {
      await this.amqpConnection.publish('nutrify.events', 'user.level_up', {
        userId,
        newLevel,
      });
      await this.redis.del(this.LEADERBOARD_CACHE_KEY);
    }
  }

  async unlockBadge(userId: string, badgeCode: string) {
    const badge = await this.prisma.badge.findUnique({
      where: { code: badgeCode },
    });
    if (!badge) return;

    const owned = await this.prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
    });

    if (!owned) {
      await this.prisma.userBadge.create({
        data: { userId, badgeId: badge.id },
      });
      await this.awardXP(userId, badge.xpReward);
      await this.amqpConnection.publish('nutrify.events', 'user.badge_earned', {
        userId,
        badgeName: badge.name,
        xpReward: badge.xpReward,
      });
      await this.redis.del(this.LEADERBOARD_CACHE_KEY);
    }
  }

  // ==================================================================
  // 🕵️ Private Milestone Checkers
  // ==================================================================

  private async checkHydrationBadges(userId: string, total: number) {
    if (total >= 4000) await this.unlockBadge(userId, 'hydration_platinum');
    else if (total >= 3000) await this.unlockBadge(userId, 'hydration_gold');
    else if (total >= 2500) await this.unlockBadge(userId, 'hydration_silver');
    else if (total >= 2000) await this.unlockBadge(userId, 'hydration_bronze');
  }

  private async checkScanMilestones(userId: string) {
    const count = await this.prisma.productScan.count({ where: { userId } });
    const milestones = {
      250: 'scanner_master',
      100: 'scanner_expert',
      50: 'scanner_pro',
      10: 'scanner_novice',
      1: 'first_scan',
    };
    for (const [limit, code] of Object.entries(milestones)) {
      if (count >= +limit) await this.unlockBadge(userId, code);
    }
  }

  private async checkLoginStreakBadges(userId: string, streak: number) {
    const milestones = {
      30: 'login_streak_30',
      14: 'login_streak_14',
      7: 'login_streak_7',
      3: 'login_streak_3',
    };
    for (const [limit, code] of Object.entries(milestones)) {
      if (streak >= +limit) await this.unlockBadge(userId, code);
    }
  }

  private async checkTotalLoginBadges(userId: string, total: number) {
    const milestones = {
      365: 'total_logins_365',
      100: 'total_logins_100',
      50: 'total_logins_50',
      10: 'total_logins_10',
    };
    for (const [limit, code] of Object.entries(milestones)) {
      if (total >= +limit) await this.unlockBadge(userId, code);
    }
  }

  private async checkTimeBadges(userId: string) {
    const hour = new Date().getHours();
    if (hour < 7) await this.unlockBadge(userId, 'early_bird');
    if (hour >= 22) await this.unlockBadge(userId, 'night_owl');
  }

  async getLeaderboard(limit: number = 50) {
    const cached = await this.redis.get<any[]>(this.LEADERBOARD_CACHE_KEY);
    if (cached) {
      this.logger.debug('Leaderboard cache hit ⚡');
      return cached;
    }

    this.logger.log('Leaderboard cache miss - Fetching from DB 🐢');

    const users = await this.prisma.user.findMany({
      take: limit,
      orderBy: [{ level: 'desc' }, { xp: 'desc' }],
      select: {
        id: true,
        name: true,
        level: true,
        xp: true,
        profileImage: true,
        _count: { select: { badges: true } },
      },
    });

    const result = users.map((u, i) => ({
      rank: i + 1,
      ...u,
      totalBadges: u._count.badges,
    }));
    await this.redis.set(this.LEADERBOARD_CACHE_KEY, result, 900 * 1000);
    return result;
  }

  async getUserStats(userId: string) {
    const [user, badges, todayLog] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { earnedAt: 'desc' },
      }),
      this.prisma.dailyLog.findUnique({
        where: { userId_date: { userId, date: startOfDay(new Date()) } },
      }),
    ]);

    const xpToNext = this.XP_PER_LEVEL - (user.xp % this.XP_PER_LEVEL);
    const progressPercent = Math.round(
      ((user.xp % this.XP_PER_LEVEL) / this.XP_PER_LEVEL) * 100,
    );

    return {
      currentXP: user.xp,
      currentLevel: user.level,
      xpToNextLevel: xpToNext,
      progressPercent,
      totalBadges: badges.length,
      currentStreak: user.currentLoginStreak,
      loggedToday: !!todayLog?.didLogin,
      badges: badges.map((b) => ({
        ...b.badge,
        earnedAt: b.earnedAt,
      })),
    };
  }
}
