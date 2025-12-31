import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import * as argon from 'argon2';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  RegisterDto,
  LoginDto,
  VerifyAccountDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { OTPPurpose } from './types/auth.types';
import { Prisma } from '@prisma/client';
import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

const ARGON2_OPTIONS: argon.Options = {
  type: argon.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtAccessSecret: string;
  private readonly jwtAccessExpiration: any;
  private readonly jwtRefreshSecret: string;
  private readonly jwtRefreshExpiration: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly amqpConnection: AmqpConnection,
  ) {
    this.jwtAccessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.jwtAccessExpiration = this.config.getOrThrow<string>('JWT_EXPIRATION');
    this.jwtRefreshSecret =
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.jwtRefreshExpiration = this.config.getOrThrow<string>(
      'JWT_REFRESH_EXPIRATION',
    );
  }

  /* ───────────────────────── HELPERS ───────────────────────── */

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  private verifyOtp(raw: string, hashed: string): boolean {
    const a = Buffer.from(this.hashOtp(raw));
    const b = Buffer.from(hashed);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async emitEvent(pattern: string, payload: unknown) {
    try {
      await this.amqpConnection.publish('nutrify.events', pattern, payload);
    } catch (error) {
      this.logger.error(`Failed to emit event: ${pattern}`, error.message);
    }
  }

  /* ───────────────────────── TOKENS ───────────────────────── */

  private async getTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [at, rt] = await Promise.all([
      // Access Token: 15 minutes
      this.jwtService.signAsync(payload, {
        secret: this.jwtAccessSecret,
        expiresIn: this.jwtAccessExpiration,
      }),
      // Refresh Token: 7 days
      this.jwtService.signAsync(payload, {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpiration,
      }),
    ]);

    await this.updateRefreshTokenHash(userId, rt);

    return {
      access_token: at,
      refresh_token: rt,
    };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hash = await argon.hash(refreshToken, ARGON2_OPTIONS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: hash },
    });
  }

  /* ───────────────────────── REGISTER ───────────────────────── */

  async register(data: RegisterDto) {
    const email = this.normalizeEmail(data.email);
    const name = data.name.trim();

    try {
      const passwordHash = await argon.hash(data.password, ARGON2_OPTIONS);
      const otp = randomInt(100000, 999999).toString();

      await this.prisma.user.create({
        data: {
          email,
          name,
          password: passwordHash,
          isVerified: false,
          otpCode: this.hashOtp(otp),
          otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
          otpPurpose: OTPPurpose.EmailVerification,
        },
      });

      await this.emitEvent('auth.registered', { email, otp });

      return { message: 'Registration successful. Check email for OTP.' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists');
      }
      throw new InternalServerErrorException('Registration failed');
    }
  }

  /* ───────────────────────── VERIFY ACCOUNT ───────────────────────── */

  async verifyAccount(data: VerifyAccountDto) {
    const email = this.normalizeEmail(data.email);
    const now = new Date();

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email } });

        if (
          !existing ||
          existing.isVerified ||
          existing.otpPurpose !== OTPPurpose.EmailVerification ||
          !existing.otpCode ||
          !existing.otpExpiresAt ||
          now > existing.otpExpiresAt ||
          !this.verifyOtp(data.otp, existing.otpCode)
        ) {
          throw new BadRequestException('Invalid or expired OTP');
        }

        return tx.user.update({
          where: { email },
          data: {
            isVerified: true,
            otpCode: null,
            otpExpiresAt: null,
            otpPurpose: null,
          },
        });
      });

      await this.emitEvent('auth.verified', { email: user.email });

      const tokens = await this.getTokens(user.id, user.email);
      return {
        ...tokens,
        isOnboarded: false,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Verification failed');
    }
  }

  /* ───────────────────────── LOGIN ───────────────────────── */

  async login(data: LoginDto) {
    const email = this.normalizeEmail(data.email);

    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: { profile: { select: { onboardingCompleted: true } } },
      });

      if (
        !user ||
        !user.isVerified ||
        !(await argon.verify(user.password, data.password))
      ) {
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.emitEvent('user.logged_in', { userId: user.id });

      const tokens = await this.getTokens(user.id, user.email);
      return {
        ...tokens,
        isOnboarded: user.profile?.onboardingCompleted ?? false,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Login failed');
    }
  }

  /* ───────────────────────── LOGOUT ───────────────────────── */

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
    return { message: 'Logged out successfully' };
  }

  /* ───────────────────────── REFRESH TOKENS ───────────────────────── */

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (
      !user ||
      !user.hashedRefreshToken ||
      !(await argon.verify(user.hashedRefreshToken, refreshToken))
    ) {
      throw new ForbiddenException('Access denied');
    }

    return this.getTokens(user.id, user.email);
  }

  /* ───────────────────────── FORGOT PASSWORD ───────────────────────── */

  async forgotPassword(email: string) {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });

    if (!user) {
      return { message: 'If email exists, reset code sent.' };
    }

    const otp = randomInt(100000, 999999).toString();

    await this.prisma.user.update({
      where: { email: normalized },
      data: {
        otpCode: this.hashOtp(otp),
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        otpPurpose: OTPPurpose.PasswordReset,
      },
    });

    await this.emitEvent('auth.forgot_password', { email: normalized, otp });

    return { message: 'If email exists, reset code sent.' };
  }

  /* ───────────────────────── RESET PASSWORD ───────────────────────── */

  async resetPassword(data: ResetPasswordDto) {
    const email = this.normalizeEmail(data.email);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { email } });

        if (
          !user ||
          user.otpPurpose !== OTPPurpose.PasswordReset ||
          !user.otpCode ||
          !user.otpExpiresAt ||
          now > user.otpExpiresAt ||
          !this.verifyOtp(data.otp, user.otpCode)
        ) {
          throw new BadRequestException('Invalid or expired OTP');
        }

        const newPasswordHash = await argon.hash(
          data.newPassword,
          ARGON2_OPTIONS,
        );

        await tx.user.update({
          where: { email },
          data: {
            password: newPasswordHash,
            otpCode: null,
            otpExpiresAt: null,
            otpPurpose: null,
            hashedRefreshToken: null, // kill all sessions
          },
        });
      });

      return { message: 'Password reset successful.' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Password reset failed');
    }
  }
}
