import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { GamificationService } from '../gamification/gamification.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  CreateProfileDto,
  UpdateProfileDto,
  ActivityLevel,
  Gender,
} from './dto/biometrics.dto';

const REQUIRED_DB_COLUMNS = [
  'encryptedGender',
  'encryptedDateOfBirth',
  'encryptedHeightCm',
  'encryptedCurrentWeight',
  'activityLevel',
  'goal',
] as const;

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  private readonly ACTIVITY_MULTIPLIERS = {
    [ActivityLevel.SEDENTARY]: 1.2,
    [ActivityLevel.LIGHTLY_ACTIVE]: 1.375,
    [ActivityLevel.MODERATELY_ACTIVE]: 1.55,
    [ActivityLevel.VERY_ACTIVE]: 1.725,
    [ActivityLevel.EXTREMELY_ACTIVE]: 1.9,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly gamificationService: GamificationService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  async createProfile(userId: string, dto: CreateProfileDto) {
    this.logger.log(`Creating profile for user: ${userId}`);

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (existing) return this.updateProfile(userId, dto);

    const age = this.calculateAge(new Date(dto.dateOfBirth));
    const { bmr, tdee } = this.calculateMetabolicRates(dto, age);

    const encrypted = this.encryptProfileData(dto);

    const profile = await this.prisma.userProfile.create({
      data: {
        userId,
        ...encrypted,
        activityLevel: dto.activityLevel,
        goal: dto.goal,
        bmr,
        tdee,
      },
    });

    if (this.isProfileComplete(profile)) {
      this.emitEvent('user.profile_updated', {
        userId,
        action: 'CREATED',
      });
    }

    return this.decryptProfile(profile);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    this.logger.log(`Updating profile for user: ${userId}`);

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!existing) throw new NotFoundException('Profile not found');

    const age = this.calculateAge(new Date(dto.dateOfBirth));
    const { bmr, tdee } = this.calculateMetabolicRates(dto, age);

    const encrypted = this.encryptProfileData(dto);

    const updated = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...encrypted,
        activityLevel: dto.activityLevel,
        goal: dto.goal,
        bmr,
        tdee,
      },
    });

    if (this.isProfileComplete(updated)) {
      this.emitEvent('user.profile_updated', {
        userId,
        action: 'CREATED',
      });
    }

    return this.decryptProfile(updated);
  }

  async getProfile(userId: string) {
    const [encryptedProfile, user, stats] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          _count: {
            select: { badges: true }, // Count badges efficiently
          },
        },
      }),
      this.gamificationService.getUserStats(userId),
    ]);

    if (!encryptedProfile || !user || !stats)
      throw new NotFoundException('Profile not found');
    const profile = this.decryptProfile(encryptedProfile);
    return {
      id: profile.id,
      user: {
        userId: profile.userId,
        email: user.email,
        name: user.name,
        avatar: user.profileImage,
        allergens: user.allergies,
        level: user.level,
        xp: user.xp,
        joinedAt: user.createdAt,
      },
      bio: {
        gender: profile.gender,
        dateOfBirth: profile.dateOfBirth,
        heightCm: profile.heightCm,
        currentWeight: profile.currentWeight,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        bmr: profile.bmr,
        tdee: profile.tdee,
      },
      gamification: {
        streak: user.currentLoginStreak,
        totalLogins: user.totalLogins,
        totalBadges: user._count.badges,
        xpToNextLevel: stats.xpToNextLevel,
        progress: stats.progressPercent,
        recentBadges: stats.badges.slice(0, 3), // Show top 3 recent
      },
    };
  }

  private calculateAge(dOB: Date): number {
    const diffMs = Date.now() - dOB.getTime();
    const ageDt = new Date(diffMs);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  }

  private calculateMetabolicRates(dto: CreateProfileDto, age: number) {
    const s = dto.gender === Gender.MALE ? 5 : -161;
    const bmr = Math.round(
      10 * dto.currentWeight + 6.25 * dto.heightCm - 5 * age + s,
    );

    const multiplier = this.ACTIVITY_MULTIPLIERS[dto.activityLevel] || 1.2;
    const tdee = Math.round(bmr * multiplier);

    return { bmr, tdee };
  }

  private encryptProfileData(dto: CreateProfileDto) {
    return {
      encryptedGender: this.encryption.encrypt(dto.gender),
      encryptedDateOfBirth: this.encryption.encrypt(dto.dateOfBirth), // Store ISO string
      encryptedHeightCm: this.encryption.encrypt(dto.heightCm.toString()),
      encryptedCurrentWeight: this.encryption.encrypt(
        dto.currentWeight.toString(),
      ),
    };
  }

  private decryptProfile(profile: any) {
    return {
      id: profile.id,
      userId: profile.userId,
      gender: this.encryption.decrypt(profile.encryptedGender),
      dateOfBirth: this.encryption.decrypt(profile.encryptedDateOfBirth),
      heightCm: parseFloat(this.encryption.decrypt(profile.encryptedHeightCm)),
      currentWeight: parseFloat(
        this.encryption.decrypt(profile.encryptedCurrentWeight),
      ),
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      bmr: profile.bmr,
      tdee: profile.tdee,
      updatedAt: profile.updatedAt,
    };
  }

  private isProfileComplete(dbRecord: Record<string, any>): boolean {
    return REQUIRED_DB_COLUMNS.every((key) => {
      const value = dbRecord[key];
      return value !== null && value !== undefined && value !== '';
    });
  }

  private emitEvent(pattern: string, payload: any) {
    this.amqpConnection
      .publish('nutrify.events', pattern, payload)
      .catch((err) => this.logger.error(`Failed to emit ${pattern}`, err));
  }
}
