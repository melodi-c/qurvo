import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { addGzipPreParsing } from './hooks/gzip-preparsing';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 5242880, trustProxy: true }),
    { bufferLogs: true },
  );

  addGzipPreParsing(app.getHttpAdapter().getInstance());

  app.useLogger(app.get(Logger));
  app.enableCors({ origin: '*' });
  const port = process.env.INGEST_PORT || 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
