import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { EncryptionService } from '../encryption/encryption.service';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [NotificationController],
  providers: [NotificationService, EncryptionService],
  exports: [NotificationService],
})
export class NotificationModule {}
