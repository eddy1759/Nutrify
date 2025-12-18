import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // <--- 1. Import this
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RedisModule } from '../common/redis/redis.module';
import { LLMCoreModule } from '../llm-core/llm-core.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
  imports: [
    HttpModule, // <--- 2. Add this line here
    PrismaModule,
    RedisModule,
    LLMCoreModule,
    CloudinaryModule,
  ],
  controllers: [ScanController],
  providers: [ScanService],
})
export class ScanModule {}
