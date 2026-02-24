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
    const hitKey = `throttle:hits:${throttlerName}:${key}`;
    const now = Date.now();

    const pipeline = this.redis.pipeline();
    pipeline.zadd(hitKey, now, `${now}-${Math.random()}`);
    pipeline.zremrangebyscore(hitKey, 0, now - ttl);
    pipeline.zcard(hitKey);
    pipeline.pexpire(hitKey, ttl);
    const results = await pipeline.exec();

    const totalHits = (results?.[2]?.[1] as number) ?? 1;

    return {
      totalHits,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
