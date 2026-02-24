import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { DrizzleProvider, DRIZZLE } from '../providers/drizzle.provider';
import { ClickHouseProvider, CLICKHOUSE } from '../providers/clickhouse.provider';
import { RedisProvider, REDIS } from '../providers/redis.provider';

@Global()
@Module({
  providers: [DrizzleProvider, ClickHouseProvider, RedisProvider],
  exports: [DRIZZLE, CLICKHOUSE, REDIS],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    if (typeof this.redis.quit === 'function') {
      await this.redis.quit();
    }
  }
}
