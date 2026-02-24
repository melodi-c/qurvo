import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    _limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<{ totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number }> {
    const hitKey = `throttle:${throttlerName}:${key}`;

    const pipeline = this.redis.pipeline();
    pipeline.incr(hitKey);
    pipeline.pexpire(hitKey, ttl);
    const results = await pipeline.exec();

    const totalHits = (results?.[0]?.[1] as number) ?? 1;

    return {
      totalHits,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  async quit(): Promise<void> {
    // No-op: Redis lifecycle is managed by AppModule.onApplicationShutdown
  }
}
