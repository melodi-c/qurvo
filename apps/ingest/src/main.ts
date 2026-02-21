import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useBodyParser('json', { limit: '1mb' });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: '*' });
  const port = process.env.INGEST_PORT || 3001;
  await app.listen(port);
}

bootstrap();
