import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { addGzipPreParsing } from './hooks/gzip-preparsing';
import { MAX_DECOMPRESSED_BYTES } from './constants';
import { validateEnv, env } from './env';

async function bootstrap() {
  try {
    validateEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: MAX_DECOMPRESSED_BYTES, trustProxy: true }),
    { bufferLogs: true },
  );

  addGzipPreParsing(app.getHttpAdapter().getInstance());

  app.useLogger(app.get(Logger));
  app.enableCors({ origin: true });
  await app.listen(env().INGEST_PORT, '0.0.0.0');
}

bootstrap();
