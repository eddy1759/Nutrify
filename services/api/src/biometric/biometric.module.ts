import { Module } from '@nestjs/common';
import { BiometricService } from './biometric.service';
import { BiometricsController } from './biometric.controller';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { GamificationModule } from 'src/gamification/gamification.module';

@Module({
  imports: [EncryptionModule, GamificationModule],
  providers: [BiometricService],
  controllers: [BiometricsController],
})
export class BiometricModule {}
