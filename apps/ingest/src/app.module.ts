import { Module, Inject, OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';
import Redis from 'ioredis';
import { createDb, type Database } from '@qurvo/db';
import { REDIS, DRIZZLE } from './constants';
import { IngestController } from './ingest/ingest.controller';
import { IngestService } from './ingest/ingest.service';
import { ZodExceptionFilter } from './filters/zod-exception.filter';
import { BillingGuard } from './guards/billing.guard';

const RedisProvider = {
  provide: REDIS,
  useFactory: () => new Redis(process.env.REDIS_URL || 'redis://localhost:6379'),
};

const DrizzleProvider = {
  provide: DRIZZLE,
  useFactory: () => createDb(process.env.DATABASE_URL),
};

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        redact: ['req.headers["x-api-key"]'],
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      } as Options,
    }),
  ],
  controllers: [IngestController],
  providers: [
    RedisProvider,
    DrizzleProvider,
    IngestService,
    BillingGuard,
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
