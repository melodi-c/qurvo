import { Module, Inject, OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';
import Redis from 'ioredis';
import { createDb, type Database } from '@qurvo/db';
import { REDIS, DRIZZLE } from './constants';
import { env } from './env';
import { IngestController } from './ingest/ingest.controller';
import { IngestService } from './ingest/ingest.service';
import { ZodExceptionFilter } from './filters/zod-exception.filter';
import { BillingGuard } from './guards/billing.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';

const RedisProvider = {
  provide: REDIS,
  useFactory: () => new Redis(env().REDIS_URL),
};

const DrizzleProvider = {
  provide: DRIZZLE,
  useFactory: () => createDb(env().DATABASE_URL),
};

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: env().LOG_LEVEL,
          redact: ['req.headers["x-api-key"]'],
          transport: env().NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        } as Options,
      }),
    }),
  ],
  controllers: [IngestController],
  providers: [
    RedisProvider,
    DrizzleProvider,
    IngestService,
    BillingGuard,
    RateLimitGuard,
    { provide: APP_FILTER, useClass: ZodExceptionFilter },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async onApplicationShutdown() {
    await this.redis.quit();
    await this.db.$pool.end();
  }
}
