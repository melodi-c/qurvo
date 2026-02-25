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
import { AdminModule } from './admin/admin.module';
import { SessionAuthGuard } from './api/guards/session-auth.guard';
import { REDIS } from './providers/redis.provider';

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
          { name: 'short', ttl: 1000, limit: 20 },
          { name: 'medium', ttl: 60000, limit: 300 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    ApiModule,
    HealthModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AppModule {}
