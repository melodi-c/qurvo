import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{ totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number }> {
    const blockKey = `throttle:block:${throttlerName}:${key}`;
    const hitKey = `throttle:hits:${throttlerName}:${key}`;
    const now = Date.now();

    const blockTtl = await this.redis.pttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: blockTtl,
      };
    }

    const pipeline = this.redis.pipeline();
    pipeline.zadd(hitKey, now, `${now}-${Math.random()}`);
    pipeline.zremrangebyscore(hitKey, 0, now - ttl);
    pipeline.zcard(hitKey);
    pipeline.pexpire(hitKey, ttl);
    const results = await pipeline.exec();

    const totalHits = (results?.[2]?.[1] as number) ?? 1;
    const timeToExpire = ttl;

    if (totalHits > limit) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: blockDuration,
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
