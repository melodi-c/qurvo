import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import type Redis from 'ioredis';
import { IngestModule } from './ingest/ingest.module';
import { HealthModule } from './health/health.module';
import { REDIS } from './providers/redis.provider';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    DatabaseModule,
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
  ],
})
export class AppModule {}
