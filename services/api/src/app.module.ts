import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ScanModule } from './scan/scan.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { UserModule } from './user/user.module';
import { AgentsModule } from './agents/agents.module';
import { EmailModule } from './email/email.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { EncryptionService } from './encryption/encryption.service';
import { EncryptionModule } from './encryption/encryption.module';
import { GamificationModule } from './gamification/gamification.module';
import { NotificationModule } from './notification/notification.module';
import { BiometricModule } from './biometric/biometric.module';
import { TrackingModule } from './tracking/tracking.module';
import { RabbitMQGlobalModule } from './common/rabbitmq/rabbitmq.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RabbitMQGlobalModule,
    RedisModule,
    AuthModule,
    EmailModule,
    CloudinaryModule,
    EncryptionModule,
    ScanModule,
    AnalyticsModule,
    UserModule,
    AgentsModule,
    GamificationModule,
    NotificationModule,
    BiometricModule,
    TrackingModule,
  ],
  controllers: [AppController],
  providers: [EncryptionService],
})
export class AppModule implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  async onApplicationBootstrap() {
    this.logger.log('NestJS Application Bootstrap phase started...');
    console.log('Final check: All modules are loaded.');
  }
}
