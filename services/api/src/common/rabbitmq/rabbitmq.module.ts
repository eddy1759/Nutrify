import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const envUrl = config.get<string>('RABBITMQ_URL');
        const logger = new Logger('RabbitMQ');
        const url = envUrl || 'amqp://guest:guest@cla_rabbit:5672';
        if (!envUrl) {
          logger.warn('⚠️ RABBITMQ_URL missing. Using default: ' + url);
        } else {
          logger.log('🔌 Connecting to RabbitMQ at: ' + url.split('@')[1]);
        }

        return {
          exchanges: [
            {
              name: 'nutrify.events',
              type: 'topic',
            },
          ],
          uri: url,
          connectionInitOptions: {
            wait: false,
            reject: false,
            timeout: 5000,
          },
          connectionManagerOptions: {
            heartbeatIntervalInSeconds: 60,
            reconnectTimeInSeconds: 5,
          },
          enableControllerDiscovery: true,
        };
      },
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitMQGlobalModule {}
