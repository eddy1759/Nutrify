import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const PORT = process.env.PORT || 7860;
  const NODE_ENV = configService.get<string>('NODE_ENV');

  app.use(helmet());

  // app.enableCors({
  //   origin: configService.get<string>('CORS_ORIGIN') || '*',
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  //   credentials: true,
  // });

  app.setGlobalPrefix('api', {
    exclude: ['/', 'health'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(Number(PORT), '0.0.0.0');

  // 3. Log the ACTUAL address to confirm it worked
  const server = app.getHttpServer();
  const address = server.address();
  logger.log(
    `🚀 API Gateway is listening on: ${JSON.stringify(address)} on ${NODE_ENV} environment`,
  );

  if (typeof address === 'object' && address?.family === 'IPv6') {
    logger.error('❌ WARNING: Server is bound to IPv6! Hugging Face may 404.');
  }
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Error starting server', err);
  process.exit(1);
});
