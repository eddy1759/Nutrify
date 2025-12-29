import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import * as argon from 'argon2';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  RegisterDto,
  LoginDto,
  verifyAccountDto,
  ResetPasswordDto,
} from './dto/auth.dto';
// import { EmailService } from '../email/email.service';
import { OTPPurpose } from './types/auth.types';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
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
    private prisma: PrismaService,
    private config: ConfigService,
    private jwtService: JwtService,
    // private emailService: EmailService,
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

  private async getTokens(userId: string, email: string, allergies: string[]) {
    const payload = { sub: userId, email, allergies };

    const [at, rt] = await Promise.all([
      // Access Token: 15 minutes
      this.jwtService.signAsync(payload, {
        secret: this.jwtAccessSecret,
        expiresIn: this.jwtAccessExpiration,
      }),
      // Refresh Token: 7 days
      this.jwtService.signAsync(payload, {
        secret: this.jwtRefreshSecret,
        expiresIn: '7d',
      }),
    ]);

    await this.updateRefreshTokenHash(userId, rt);

    return {
      access_token: at,
      refresh_token: rt,
    };
  }

  async register(data: RegisterDto) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const normalizedUsername = data.name.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) throw new BadRequestException('User already exists');

    try {
      const hashedPassword = await argon.hash(data.password, ARGON2_OPTIONS);

      const otp = randomInt(100000, 999999).toString();
      const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
      const purpose = OTPPurpose.EmailVerification;

      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: normalizedUsername,
          otpCode: otp,
          otpExpiresAt: otpExpires,
          otpPurpose: purpose,
          isVerified: false,
        },
      });

      if (this.config.get<string>('NODE_ENV') === 'development') {
        this.logger.log(`User registered: ${user.id}, otp: ${otp}`);
      }

      // await this.sendVerificationEmail(data.email, otp);
      await this.emitEvent('auth.registered', {
        email: normalizedEmail,
        name: normalizedUsername,
        otp,
      });

      return { message: 'User registered. Please check email for OTP.' };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException('Email Already Exists');
      }
      this.logger.error(`Registration failed: ${error.message}`);
      throw new InternalServerErrorException('Could not register user');
    }
  }

  async verifyAccount(data: verifyAccountDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (!user) throw new BadRequestException('User not found');

      if (user.isVerified)
        throw new BadRequestException('User verified already');

      // We throw if Now is GREATER THAN (after) Expiry.
      if (user.otpCode !== data.otp || new Date() > user.otpExpiresAt) {
        throw new BadRequestException('Invalid or expired OTP');
      }

      if (user.otpPurpose !== OTPPurpose.EmailVerification)
        throw new BadRequestException('Invalid OTP purpose');

      await this.prisma.user.update({
        where: { email: data.email },
        data: {
          isVerified: true,
          otpCode: null,
          otpExpiresAt: null,
          otpPurpose: null,
        },
      });

      // #TODO: refactor the email sending to use a background job or task
      // await this.emailService.sendWelcomeMail(user.email, user.name);
      await this.emitEvent('auth.verified', {
        email: user.email,
        name: user.name,
      });

      return await this.getTokens(user.id, user.email, user.allergies);
    } catch (error) {
      this.logger.error('An error occur trying to verify user', error.message);
      throw new InternalServerErrorException('An error occur verifying user');
    }
  }

  async login(data: LoginDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (!user) throw new UnauthorizedException('Invalid credentials');

      if (!user.isVerified)
        throw new UnauthorizedException('Unverified account');

      if (!(await argon.verify(user.password, data.password)))
        throw new UnauthorizedException('Invalid Credentials');

      this.logger.log(`User logged in: ${user.email}`);

      this.emitEvent('user.logged_in', {
        userId: user.id,
      });

      return await this.getTokens(user.id, user.email, user.allergies);
    } catch (error) {
      this.logger.log('An error occur while loggin in', error.message);
      throw new InternalServerErrorException(
        'Error occur while trying to login',
      );
    }
  }

  async logout(userId: string) {
    try {
      await this.prisma.user.updateMany({
        where: {
          id: userId,
          hashedRefreshToken: { not: null },
        },
        data: { hashedRefreshToken: null },
      });
      return { message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error(
        `Error during logout for user ${userId}`,
        error.message,
      );
      throw new InternalServerErrorException('Logout failed');
    }
  }

  async refreshTokens(userId: string, rt: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.hashedRefreshToken)
      throw new ForbiddenException('Access Denied');

    // Verify the Refresh Token matches the hash in DB
    const rtMatches = await argon.verify(user.hashedRefreshToken, rt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    // Generate NEW tokens (Rotation)
    const tokens = await this.getTokens(user.id, user.email, user.allergies);

    return tokens;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.log(
        `Forgot password attempt for non-existent email: ${email}`,
      );
      return { message: 'If this email exists, a reset code has been sent.' };
    }

    const otp = randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
    const purpose = OTPPurpose.PasswordReset;

    await this.prisma.user.update({
      where: { email },
      data: {
        otpCode: otp,
        otpExpiresAt: otpExpires,
        otpPurpose: purpose,
      },
    });

    // await this.sendPasswordResetEmail(user.email, otp);
    await this.emitEvent('auth.forgot_password', {
      email: user.email,
      otp,
    });
    return { message: 'Reset code sent to email.' };
  }

  async resetPassword(data: ResetPasswordDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (
        !user ||
        user.otpCode !== data.otp ||
        new Date() > user.otpExpiresAt ||
        user.otpPurpose !== OTPPurpose.PasswordReset
      ) {
        throw new BadRequestException('Invalid or expired OTP');
      }

      const hashedPassword = await argon.hash(data.newPassword);

      await this.prisma.user.update({
        where: { email: data.email },
        data: {
          password: hashedPassword,
          otpCode: null,
          otpExpiresAt: null,
          otpPurpose: null,
        },
      });

      return { message: 'Password reset successfully.' };
    } catch (error) {
      this.logger.error(
        'Error occur while trying to reset password',
        error.message,
      );
      throw new InternalServerErrorException(
        'Error occur while trying to reset password',
      );
    }
  }

  async updateRefreshTokenHash(userId: string, refreshToken: string) {
    try {
      const hash = await argon.hash(refreshToken, ARGON2_OPTIONS);
      await this.prisma.user.update({
        where: { id: userId },
        data: { hashedRefreshToken: hash },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update refresh token hash for user ${userId}`,
        error.message,
      );
      throw new InternalServerErrorException('Could not update refresh token.');
    }
  }

  private emitEvent(pattern: string, payload: any) {
    this.amqpConnection
      .publish('nutrify.events', pattern, payload)
      .catch((err) => this.logger.error(`Failed to emit ${pattern}`, err));
  }
}
