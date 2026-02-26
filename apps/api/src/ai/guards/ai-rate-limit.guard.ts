import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../../providers/redis.provider';
import { TooManyRequestsException } from '../../exceptions/too-many-requests.exception';
import {
  AI_RATE_LIMIT_PER_MINUTE,
  AI_RATE_LIMIT_PER_HOUR,
  AI_RATE_LIMIT_MINUTE_WINDOW_SECONDS,
  AI_RATE_LIMIT_HOUR_WINDOW_SECONDS,
} from '../../constants';

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.user_id;
    if (!userId) return true;

    const now = Math.floor(Date.now() / 1000);
    const minuteBucket = Math.floor(now / AI_RATE_LIMIT_MINUTE_WINDOW_SECONDS);
    const hourBucket = Math.floor(now / AI_RATE_LIMIT_HOUR_WINDOW_SECONDS);

    const minuteKey = `ai:rl:m:${userId}:${minuteBucket}`;
    const hourKey = `ai:rl:h:${userId}:${hourBucket}`;

    const [minuteCount, hourCount] = await this.redis
      .pipeline()
      .incr(minuteKey)
      .expire(minuteKey, AI_RATE_LIMIT_MINUTE_WINDOW_SECONDS * 2)
      .incr(hourKey)
      .expire(hourKey, AI_RATE_LIMIT_HOUR_WINDOW_SECONDS * 2)
      .exec()
      .then((results) => {
        if (!results) return [0, 0];
        const minute = (results[0][1] as number) ?? 0;
        const hour = (results[2][1] as number) ?? 0;
        return [minute, hour];
      });

    if (minuteCount > AI_RATE_LIMIT_PER_MINUTE) {
      await this.redis.pipeline().decr(minuteKey).decr(hourKey).exec();
      const retryAfter = AI_RATE_LIMIT_MINUTE_WINDOW_SECONDS - (now % AI_RATE_LIMIT_MINUTE_WINDOW_SECONDS);
      throw new TooManyRequestsException(
        `AI chat rate limit exceeded: max ${AI_RATE_LIMIT_PER_MINUTE} requests per minute`,
        retryAfter,
      );
    }

    if (hourCount > AI_RATE_LIMIT_PER_HOUR) {
      await this.redis.pipeline().decr(minuteKey).decr(hourKey).exec();
      const retryAfter = AI_RATE_LIMIT_HOUR_WINDOW_SECONDS - (now % AI_RATE_LIMIT_HOUR_WINDOW_SECONDS);
      throw new TooManyRequestsException(
        `AI chat rate limit exceeded: max ${AI_RATE_LIMIT_PER_HOUR} requests per hour`,
        retryAfter,
      );
    }

    return true;
  }
}
