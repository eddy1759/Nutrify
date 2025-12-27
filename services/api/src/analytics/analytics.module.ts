import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { LLMCoreModule } from 'src/llm-core/llm-core.module';

@Module({
  imports: [PrismaModule, LLMCoreModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
