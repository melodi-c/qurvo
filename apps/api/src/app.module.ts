import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { ApiModule } from './api/api.module';
import { HealthModule } from './health/health.module';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        redact: ['req.headers.authorization'],
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      } as any,
    }),
    DatabaseModule,
    EmailModule,
    ThrottlerModule.forRootAsync({
      imports: [DatabaseModule],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 20 },
          { name: 'medium', ttl: 60000, limit: 300 },
        ],
        storage,
      }),
      inject: [RedisThrottlerStorage],
    }),
    ApiModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
