import { Module } from '@nestjs/common';
import { BiometricService } from './biometric.service';
import { BiometricsController } from './biometric.controller';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { GamificationModule } from 'src/gamification/gamification.module';
import { BiometricEventsListener } from './biometric.listener';

@Module({
  imports: [EncryptionModule, GamificationModule],
  providers: [BiometricService, BiometricEventsListener],
  controllers: [BiometricsController],
  exports: [BiometricService],
})
export class BiometricModule {}
