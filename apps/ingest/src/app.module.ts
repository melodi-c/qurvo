import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import Redis from 'ioredis';
import { createDb } from '@qurvo/db';
import { REDIS, DRIZZLE } from './constants';
import { IngestController } from './ingest/ingest.controller';
import { IngestService } from './ingest/ingest.service';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { ZodExceptionFilter } from './filters/zod-exception.filter';

const RedisProvider = {
  provide: REDIS,
  useFactory: () => new Redis(process.env.REDIS_URL || 'redis://localhost:6379'),
};

const DrizzleProvider = {
  provide: DRIZZLE,
  useFactory: () => createDb(process.env.DATABASE_URL),
};

@Global()
@Module({
  imports: [
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
  ],
  controllers: [IngestController],
  providers: [
    RedisProvider,
    DrizzleProvider,
    IngestService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ZodExceptionFilter },
  ],
  exports: [RedisProvider, DrizzleProvider],
})
export class AppModule {}
