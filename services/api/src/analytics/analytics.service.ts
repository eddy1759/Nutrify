import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { LlmLanguageProvider } from '../llm-core/llm.provider';

export interface DashboardData {
  avatar: string;
  calories: { target: number; current: number; remaining: number };
  macros: {
    protein: { current: number; target: number };
    fat: { current: number; target: number };
    carbs: { current: number; target: number };
  };
  biometrics: { waterMl: number; weightKg: number | null };
  // Updated interface to support both types
  recentMeals: Array<{
    id: string;
    type: 'MEAL' | 'SCAN'; // 👈 New discriminator
    name: string;
    kcal: number | null;
    time: Date;
    imageUrl: string | null;
    meta?: any; // Extra data like Nova Score for scans
  }>;
}

export interface AnalyticsData {
  summary: {
    nutritionalHealthScore: number;
    totalPts: number;
    totalProductsAnalysed: number;
    currentStreak: number;
  };
  novaDistribution: Array<{
    group: number;
    label: string;
    count: number;
  }>;
  trends: any[];
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmLanguageProvider,
    private readonly redis: RedisService,
  ) {}

  // ==================================================================
  // 🍎 DASHBOARD
  // ==================================================================
  async getDashboard(userId: string): Promise<DashboardData> {
    const cacheKey = `dashboard:${userId}`;
    const cached = await this.redis.get<DashboardData>(cacheKey);
    if (cached) return cached;

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // 1. Fetch Data in Parallel
    const [user, profile, aggregates, recentLogEntries, recentScans, dailyLog] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.userProfile.findUnique({ where: { userId } }),
        this.prisma.nutritionLog.aggregate({
          where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
          _sum: { calories: true, protein: true, carbs: true, fat: true },
        }),
        // Fetch recent MEALS
        this.prisma.nutritionLog.findMany({
          where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        // Fetch recent SCANS
        this.prisma.productScan.findMany({
          where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.dailyLog.findUnique({
          where: { userId_date: { userId, date: todayStart } },
        }),
      ]);

    if (!user || !profile)
      throw new NotFoundException(
        'User profile not found. Please complete onboarding.',
      );

    // 2. Merge and Sort Recent Activity
    const combinedHistory = [
      ...recentLogEntries.map((m) => ({
        id: m.id,
        type: 'MEAL' as const,
        name: m.foodName,
        kcal: m.calories,
        time: m.createdAt,
        imageUrl: m.imageUrl,
        meta: null,
      })),
      ...recentScans.map((s) => ({
        id: s.id,
        type: 'SCAN' as const,
        name: s.productName || 'Scanned Product',
        kcal: null, // Scans might not have calories immediately
        time: s.createdAt,
        imageUrl: s.imageUrl,
        meta: { novaScore: s.novaScore, isSafe: s.isSafe },
      })),
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime()) // Sort by newest first
      .slice(0, 5); // Take top 5

    const dashboardData: DashboardData = {
      avatar: user.profileImage,
      calories: {
        target: profile.tdee || 0,
        current: aggregates._sum.calories || 0,
        remaining: Math.max(0, profile.tdee - (aggregates._sum.calories || 0)),
      },
      macros: {
        protein: {
          current: aggregates._sum.protein || 0,
          target: Math.round((profile.tdee * 0.3) / 4) || 0,
        },
        fat: {
          current: aggregates._sum.fat || 0,
          target: Math.round((profile.tdee * 0.25) / 9) || 0,
        },
        carbs: {
          current: aggregates._sum.carbs || 0,
          target: Math.round((profile.tdee * 0.45) / 4) || 0,
        },
      },
      biometrics: {
        waterMl: dailyLog?.waterMl || 0,
        weightKg: dailyLog?.weightKg || null,
      },
      recentMeals: combinedHistory,
    };

    await this.redis.set(cacheKey, dashboardData, 120);
    return dashboardData;
  }

  // ==================================================================
  // 📈 ANALYTICS
  // ==================================================================
  async getAnalytics(userId: string): Promise<AnalyticsData> {
    const cacheKey = `analytics:${userId}`;
    const cached = await this.redis.get<AnalyticsData>(cacheKey);
    if (cached) return cached;

    const [scans, user, novaggr, novaGroups, weightTrend] = await Promise.all([
      this.prisma.productScan.count({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { currentLoginStreak: true, xp: true },
      }),
      this.prisma.productScan.aggregate({
        where: { userId },
        _avg: { novaScore: true },
      }),
      this.prisma.productScan.groupBy({
        by: ['novaScore'],
        where: { userId },
        _count: { novaScore: true },
      }),
      this.prisma.dailyLog.findMany({
        where: { userId, date: { gte: subDays(new Date(), 7) } },
        orderBy: { date: 'asc' },
        select: { date: true, caloriesIn: true, weightKg: true },
      }),
    ]);

    const totalNovaPoints = novaGroups.reduce(
      (acc, curr) => acc + curr.novaScore * curr._count.novaScore,
      0,
    );
    const avgNova = novaggr._avg.novaScore || 4;
    const healthScore = Math.max(0, Math.round(((4 - avgNova) / 3) * 100));

    const analyticsData: AnalyticsData = {
      summary: {
        nutritionalHealthScore: healthScore,
        totalPts: totalNovaPoints,
        totalProductsAnalysed: scans,
        currentStreak: user?.currentLoginStreak || 0,
      },
      novaDistribution: novaGroups.map((g) => ({
        group: g.novaScore,
        label: `NOVA ${g.novaScore}`,
        count: g._count.novaScore,
      })),
      trends: weightTrend,
    };

    await this.redis.set(cacheKey, analyticsData, 900);
    return analyticsData;
  }

  // ==================================================================
  // 🤖 AI INSIGHTS
  // ==================================================================
  async getAiInsights(userId: string) {
    const cacheKey = `ai_insights:${userId}`;
    const cached = await this.redis.get<{ insight: string }>(cacheKey);
    if (cached) return cached;

    const dashboard = await this.getDashboard(userId);
    const analytics = await this.getAnalytics(userId);

    const healthScore = analytics.summary.nutritionalHealthScore;
    const remainingKcal = dashboard.calories.remaining;
    const totalScans = analytics.summary.totalProductsAnalysed;

    const hasHighUpf = analytics.novaDistribution.some(
      (d) => d.group === 4 && d.count > 3,
    );

    const prompt = `
      User Nutrition Context:
      - Health Score: ${healthScore}/100
      - Scanned Products: ${totalScans}
      - Energy Balance: ${remainingKcal} kcal left for today.
      - UPF Risk: ${hasHighUpf ? 'High' : 'Low'}
      
      Act as a helpful health coach. Provide 3 specific, actionable nutrition tips based on this data.
    `;

    const insightText = await this.llm.generateText(prompt);
    const result = { insight: insightText, generatedAt: new Date() };

    await this.redis.set(cacheKey, result, 3600);
    return result;
  }
}
