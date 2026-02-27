import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { DatabaseModule } from './database/database.module';
import { ApiModule } from './api/api.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './email/email.module';
import { SessionAuthGuard } from './api/guards/session-auth.guard';
import { REDIS } from './providers/redis.provider';
import {
  THROTTLE_SHORT_TTL_MS,
  THROTTLE_SHORT_LIMIT,
  THROTTLE_MEDIUM_TTL_MS,
  THROTTLE_MEDIUM_LIMIT,
} from './constants';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        redact: ['req.headers.authorization'],
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      } as Record<string, unknown>,
    }),
    DatabaseModule,
    EmailModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: THROTTLE_SHORT_TTL_MS, limit: THROTTLE_SHORT_LIMIT },
          { name: 'medium', ttl: THROTTLE_MEDIUM_TTL_MS, limit: THROTTLE_MEDIUM_LIMIT },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    ApiModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AppModule {}
