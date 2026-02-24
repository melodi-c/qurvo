import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { IngestModule } from './ingest/ingest.module';
import { HealthModule } from './health/health.module';
import { REDIS } from './providers/redis.provider';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ZodExceptionFilter } from './filters/zod-exception.filter';

@Module({
  imports: [
    InfrastructureModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        redact: ['req.headers["x-api-key"]'],
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      } as any,
    }),
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 50 },
          { name: 'medium', ttl: 60000, limit: 1000 },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    IngestModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ZodExceptionFilter },
  ],
})
export class AppModule {}
