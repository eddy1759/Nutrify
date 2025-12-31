import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { BiometricService } from './biometric.service';

@Injectable()
export class BiometricEventsListener {
  constructor(private readonly biometricService: BiometricService) {}

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'user.logged_weight',
    queue: 'biometrics_weight_updates',
  })
  async handleWeightLog(payload: {
    userId: string;
    weightKg: number;
    date: string;
  }) {
    const logDate = new Date(payload.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (logDate >= today) {
      await this.biometricService.updateCurrentWeightFromLog(
        payload.userId,
        payload.weightKg,
      );
    }
  }
}
