import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor, CH_EXECUTOR } from '@qurvo/clickhouse';
import type { Database } from '@qurvo/db';
import { DrizzleProvider, DRIZZLE } from '../providers/drizzle.provider';
import { ClickHouseProvider, CLICKHOUSE } from '../providers/clickhouse.provider';
import { RedisProvider, REDIS } from '../providers/redis.provider';

const ChExecutorProvider = {
  provide: CH_EXECUTOR,
  useFactory: (ch: ClickHouseClient) => new ChQueryExecutor(ch),
  inject: [CLICKHOUSE],
};

@Global()
@Module({
  providers: [DrizzleProvider, ClickHouseProvider, RedisProvider, ChExecutorProvider],
  exports: [DRIZZLE, CLICKHOUSE, REDIS, CH_EXECUTOR],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([
      typeof this.redis.quit === 'function' ? this.redis.quit() : Promise.resolve(),
      typeof this.ch.close === 'function' ? this.ch.close() : Promise.resolve(),
      this.db.$client?.end?.() ?? Promise.resolve(),
    ]);
    this.logger.log('All database connections closed');
  }
}
