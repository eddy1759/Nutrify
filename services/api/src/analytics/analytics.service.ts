import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserDashboard(userId: string) {
    const totalScans = await this.prisma.productScan.count({
      where: { userId },
    });

    const aggregations = await this.prisma.productScan.aggregate({
      where: { userId },
      _avg: { novaScore: true },
    });

    const novaDistribution = await this.prisma.productScan.groupBy({
      by: ['novaScore'],
      where: { userId },
      _count: { novaScore: true },
    });

    const recentScans = await this.prisma.productScan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        productName: true,
        novaScore: true,
        createdAt: true,
        imageUrl: true,
      },
    });

    return {
      stats: {
        totalScans,
        averageNOVA: aggregations._avg.novaScore || 0,
        healthScore: Math.max(
          0,
          Math.round(((4 - (aggregations._avg.novaScore || 4)) / 3) * 100),
        ),
      },
      distribution: novaDistribution.map((d) => ({
        group: d.novaScore,
        count: d._count.novaScore,
      })),
      recentScans,
    };
  }
}
