import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { PrismaService } from './common/prisma/prisma.service';
import { ScanModule } from './scan/scan.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { UserModule } from './user/user.module';
import { AgentsModule } from './agents/agents.module';
import { EmailModule } from './email/email.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
    ScanModule,
    AnalyticsModule,
    UserModule,
    AgentsModule,
    EmailModule,
    CloudinaryModule,
  ],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
