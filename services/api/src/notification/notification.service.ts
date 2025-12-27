import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly expo: Expo;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {
    // Initialize Expo SDK
    this.expo = new Expo({
      accessToken: this.config.get('EXPO_ACCESS_TOKEN'),
    });
  }

  // ==================================================================
  // 🐇 RabbitMQ Consumers (Event Listeners)
  // ==================================================================

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.level_up',
    queue: 'notifications.level_up',
  })
  async handleLevelUp(payload: { userId: string; newLevel: number }) {
    this.logger.log(`Processing Level Up for ${payload.userId}`);

    const dataCheck = { level: payload.newLevel };
    if (await this.checkIdempotency(payload.userId, 'LEVEL_UP', dataCheck))
      return;

    await this.processNotification(
      payload.userId,
      'Level Up! 🎉',
      `Congratulations! You've reached Level ${payload.newLevel}.`,
      'LEVEL_UP',
      dataCheck,
    );
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.badge_earned',
    queue: 'notifications.badge_earned',
  })
  async handleBadgeEarned(payload: {
    userId: string;
    badgeName: string;
    xpReward: number;
  }) {
    this.logger.log(`Processing Badge Earned for ${payload.userId}`);

    const dataCheck = { badge: payload.badgeName };
    if (await this.checkIdempotency(payload.userId, 'BADGE_EARNED', dataCheck))
      return;

    await this.processNotification(
      payload.userId,
      'New Badge Unlocked! 🏆',
      `You earned the ${payload.badgeName} badge. +${payload.xpReward} XP!`,
      'BADGE_EARNED',
      dataCheck,
    );
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.logged_water',
    queue: 'notifications.water',
  })
  async handleWaterLogged(payload: { userId: string; totalToday: number }) {
    if (payload.totalToday >= 2500) {
      const today = new Date().toISOString().split('T')[0];
      if (
        await this.checkIdempotency(payload.userId, 'HYDRATION_GOAL', {
          date: today,
        })
      )
        return;

      await this.processNotification(
        payload.userId,
        'Hydration Goal Reached! 💧',
        'Great job hitting your daily water target!',
        'HYDRATION_GOAL',
        { date: today },
      );
    }
  }

  // ==================================================================
  // 🛠️ Core Processing Logic
  // ==================================================================

  /**
   * Orchestrates saving to DB and sending Push via Expo
   */
  private async processNotification(
    userId: string,
    title: string,
    body: string,
    type: string,
    metadata: any,
  ) {
    try {
      await this.prisma.notification.create({
        data: { userId, title, body, type, data: metadata },
      });
      await this.sendPushNotification(userId, title, body, metadata);
    } catch (e) {
      this.logger.error(`Notification failed for ${userId}`, e);
    }
  }

  private async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data: any,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { enCryptedPushToken: true },
      });

      if (!user?.enCryptedPushToken) return;

      const pushToken = this.encryption.decrypt(user.enCryptedPushToken);

      if (!Expo.isExpoPushToken(pushToken)) {
        this.logger.warn(`Invalid Expo Push Token for user ${userId}`);
        return;
      }

      const messages: ExpoPushMessage[] = [
        {
          to: pushToken,
          sound: 'default',
          title,
          body,
          data,
        },
      ];

      // Expo requires batching (Chunking) logic for robustness
      const chunks = this.expo.chunkPushNotifications(messages);

      for (const chunk of chunks) {
        try {
          await this.expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          this.logger.error('Error sending Expo chunk', error);
        }
      }
    } catch (error) {
      this.logger.error(`Push dispatch failed for ${userId}`, error);
    }
  }

  // ==================================================================
  // 🛡️ Idempotency Helpers
  // ==================================================================

  /**
   * Checks if a notification of this type/content already exists
   * to prevent duplicate alerts for the same achievement.
   */
  private async checkIdempotency(
    userId: string,
    type: string,
    dataCheck: any,
  ): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { userId, type, data: { equals: dataCheck } },
    });
    return !!existing;
  }

  // ==================================================================
  // 🔌 Public API Methods
  // ==================================================================

  async getUserNotifications(userId: string, limit: number = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async savePushToken(userId: string, token: string) {
    if (!Expo.isExpoPushToken(token)) {
      throw new Error('Invalid Expo Push Token');
    }
    const encrypted = this.encryption.encrypt(token);
    await this.prisma.user.update({
      where: { id: userId },
      data: { enCryptedPushToken: encrypted },
    });
    return { success: true };
  }
}
