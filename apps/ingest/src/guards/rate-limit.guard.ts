import { CanActivate, ExecutionContext, Injectable, Inject, HttpException } from '@nestjs/common';
import Redis from 'ioredis';
import {
  REDIS,
  RATE_LIMIT_KEY_PREFIX,
  RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMIT_MAX_EVENTS,
  RATE_LIMIT_BUCKET_SECONDS,
} from '../constants';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<import('fastify').FastifyRequest>();
    const projectId = request.projectId;

    const nowSec = Math.floor(Date.now() / 1000);
    const bucketCount = RATE_LIMIT_WINDOW_SECONDS / RATE_LIMIT_BUCKET_SECONDS;

    const keys: string[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bucket = Math.floor((nowSec - i * RATE_LIMIT_BUCKET_SECONDS) / RATE_LIMIT_BUCKET_SECONDS) * RATE_LIMIT_BUCKET_SECONDS;
      keys.push(`${RATE_LIMIT_KEY_PREFIX}:${projectId}:${bucket}`);
    }

    const values = await this.redis.mget(...keys);
    const total = values.reduce((sum, v) => sum + (v !== null ? parseInt(v, 10) : 0), 0);

    if (total >= RATE_LIMIT_MAX_EVENTS) {
      throw new HttpException(
        { statusCode: 429, message: 'Rate limit exceeded', retry_after: RATE_LIMIT_BUCKET_SECONDS },
        429,
      );
    }

    return true;
  }
}
