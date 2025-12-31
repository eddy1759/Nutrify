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
  recentMeals: Array<{
    id: string;
    type: 'MEAL' | 'SCAN';
    name: string;
    kcal: number | null;
    time: Date;
    imageUrl: string | null;
    meta?: any;
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
  // 🍎 DASHBOARD (Unchanged - Keeps 2 min cache)
  // ==================================================================
  async getDashboard(userId: string): Promise<DashboardData> {
    const cacheKey = `dashboard:${userId}`;
    const cached = await this.redis.get<DashboardData>(cacheKey);
    if (cached) return cached;

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const [user, profile, aggregates, recentLogEntries, recentScans, dailyLog] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.userProfile.findUnique({ where: { userId } }),
        this.prisma.nutritionLog.aggregate({
          where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
          _sum: { calories: true, protein: true, carbs: true, fat: true },
        }),
        this.prisma.nutritionLog.findMany({
          where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.productScan.findMany({
          where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.dailyLog.findUnique({
          where: { userId_date: { userId, date: todayStart } },
        }),
      ]);

    if (!user || !profile) throw new NotFoundException('Complete Onboarding.');

    let dailyTarget = profile.tdee || 2000;

    if (profile.goal === 'cut') {
      dailyTarget -= 500;
    } else if (profile.goal === 'bulk') {
      dailyTarget += 500;
    }

    const proteinTarget = Math.round((dailyTarget * 0.3) / 4);
    const fatTarget = Math.round((dailyTarget * 0.25) / 9);
    const carbsTarget = Math.round((dailyTarget * 0.45) / 4);

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
        kcal: null,
        time: s.createdAt,
        imageUrl: s.imageUrl,
        meta: { novaScore: s.novaScore, isSafe: s.isSafe },
      })),
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);

    const dashboardData: DashboardData = {
      avatar: user.profileImage,
      calories: {
        target: dailyTarget,
        current: aggregates._sum.calories || 0,
        remaining: Math.max(0, dailyTarget - (aggregates._sum.calories || 0)),
      },
      macros: {
        protein: {
          current: aggregates._sum.protein || 0,
          target: proteinTarget,
        },
        fat: {
          current: aggregates._sum.fat || 0,
          target: fatTarget,
        },
        carbs: {
          current: aggregates._sum.carbs || 0,
          target: carbsTarget,
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
  // 📈 ANALYTICS (Dynamic Period: 7D, 14D, 30D, ALL)
  // ==================================================================
  async getAnalytics(userId: string, period: string): Promise<AnalyticsData> {
    // 1. Create a unique cache key based on the period
    const cacheKey = `analytics:${userId}:${period}`;
    const cached = await this.redis.get<AnalyticsData>(cacheKey);
    if (cached) return cached;

    // 2. Determine Date Filters & Cache TTL
    let dateFilter: any = {};
    let cacheTTL = 900; // Default 15 mins

    const now = new Date();

    switch (period) {
      case '7D':
        dateFilter = { gte: subDays(now, 7) };
        cacheTTL = 300; // 5 mins (Data changes frequently)
        break;
      case '14D':
        dateFilter = { gte: subDays(now, 14) };
        cacheTTL = 600; // 10 mins
        break;
      case '30D':
        dateFilter = { gte: subDays(now, 30) };
        cacheTTL = 1800; // 30 mins
        break;
      case 'ALL':
        dateFilter = {}; // No limit
        cacheTTL = 3600; // 1 hour (Historical data is stable)
        break;
      default:
        // Fallback to 7D if invalid input
        dateFilter = { gte: subDays(now, 7) };
    }

    // 3. Execute Queries in Parallel with Date Filter applied
    const [scansCount, mealsCount, user, novaggr, novaGroups, weightTrend] =
      await Promise.all([
        // Count scans in this period
        this.prisma.productScan.count({
          where: { userId, createdAt: dateFilter },
        }),

        this.prisma.nutritionLog.count({
          where: { userId, createdAt: dateFilter },
        }),

        // Get user streak (Global stat, but we need it for summary)
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { currentLoginStreak: true },
        }),

        // Average NOVA score for this period
        this.prisma.productScan.aggregate({
          where: { userId, createdAt: dateFilter },
          _avg: { novaScore: true },
        }),

        // NOVA Distribution for this period
        this.prisma.productScan.groupBy({
          by: ['novaScore'],
          where: { userId, createdAt: dateFilter },
          _count: { novaScore: true },
        }),

        // Weight/Calorie Trends for this period
        this.prisma.dailyLog.findMany({
          where: { userId, date: dateFilter },
          orderBy: { date: 'asc' },
          select: { date: true, caloriesIn: true, weightKg: true },
        }),
      ]);

    // 4. Calculate Scores
    const totalNovaPoints = novaGroups.reduce(
      (acc, curr) => acc + curr.novaScore * curr._count.novaScore,
      0,
    );

    // Default to 4 (worst) if no scans exist in period
    const avgNova = novaggr._avg.novaScore || 0;

    // Calculate Health Score (Simple algorithm: Lower NOVA = Higher Score)
    // If no scans (avgNova is 0), score is 0.
    // If avgNova is 1 (Best), score is 100. If 4 (Worst), score is 0.
    const healthScore =
      avgNova === 0 ? 0 : Math.max(0, Math.round(((4 - avgNova) / 3) * 100));

    const totalProductsAnalysed = scansCount + mealsCount;

    const analyticsData: AnalyticsData = {
      summary: {
        nutritionalHealthScore: healthScore,
        totalPts: totalNovaPoints,
        totalProductsAnalysed,
        currentStreak: user?.currentLoginStreak || 0,
      },
      novaDistribution: novaGroups.map((g) => ({
        group: g.novaScore,
        label: `NOVA ${g.novaScore}`,
        count: g._count.novaScore,
      })),
      trends: weightTrend,
    };

    // 5. Store in Redis with dynamic TTL
    await this.redis.set(cacheKey, analyticsData, cacheTTL);

    return analyticsData;
  }

  // ==================================================================
  // 🤖 AI INSIGHTS
  // ==================================================================
  async getAiInsights(userId: string) {
    const cacheKey = `ai_insights:${userId}`;
    const cached = await this.redis.get<{ insight: string }>(cacheKey);
    if (cached) return cached;

    // Use default (7D) context for AI to keep it relevant to recent habits
    const dashboard = await this.getDashboard(userId);
    const analytics = await this.getAnalytics(userId, '7D');

    const healthScore = analytics.summary.nutritionalHealthScore;
    const remainingKcal = dashboard.calories.remaining;
    const totalScans = analytics.summary.totalProductsAnalysed;

    const hasHighUpf = analytics.novaDistribution.some(
      (d) => d.group === 4 && d.count > 3,
    );

    const prompt = `
      User Nutrition Context:
      - Health Score: ${healthScore}/100
      - Scanned Products (Last 7 Days): ${totalScans}
      - Energy Balance: ${remainingKcal} kcal left for today.
      - UPF Risk: ${hasHighUpf ? 'High' : 'Low'}
      
      Act as a helpful health coach. Provide 3 specific, actionable nutrition tips based on this data.
      Keep it short and encouraging.
    `;

    const insightText = await this.llm.generateText(prompt);
    const result = { insight: insightText, generatedAt: new Date() };

    await this.redis.set(cacheKey, result, 3600); // Cache insights for 1 hour
    return result;
  }
}
