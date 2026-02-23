import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { createGunzip } from 'node:zlib';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 5242880, trustProxy: true }),
    { bufferLogs: true },
  );

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('preParsing', async (request: any, _reply: any, payload: any) => {
    if (request.headers['content-encoding'] === 'gzip') {
      delete request.headers['content-encoding'];
      delete request.headers['content-length'];
      request.headers['content-type'] = 'application/json';
      return payload.pipe(createGunzip());
    }
    return payload;
  });

  app.useLogger(app.get(Logger));
  app.enableCors({ origin: '*' });
  const port = process.env.INGEST_PORT || 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
