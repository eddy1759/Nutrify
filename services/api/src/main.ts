import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const PORT = parseInt(process.env.PORT);
  const NODE_ENV = configService.get<string>('NODE_ENV');

  app.use(helmet());

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(PORT);
  logger.log(`Application is running in ${NODE_ENV} mode`);
  logger.log(`API Gateway: http://localhost:${PORT}/api/v1`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Error starting server', err);
  process.exit(1);
});
