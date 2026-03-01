import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../providers/redis.provider';
import { analyticsProjectCachePattern } from './with-analytics-cache';

@Injectable()
export class AnalyticsCacheService {
  private readonly logger = new Logger(AnalyticsCacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Scans Redis for all analytics cache keys belonging to `projectId` and
   * deletes them in a single pipeline. Fire-and-forget — errors are logged
   * but never propagated to the caller.
   */
  invalidateProjectCache(projectId: string): void {
    const pattern = analyticsProjectCachePattern(projectId);

    const scanAndDelete = async () => {
      const pipeline = this.redis.pipeline();
      let keysDeleted = 0;
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = nextCursor;
        if (keys.length > 0) {
          pipeline.del(...(keys as [string, ...string[]]));
          keysDeleted += keys.length;
        }
      } while (cursor !== '0');

      if (keysDeleted > 0) {
        await pipeline.exec();
        this.logger.debug({ projectId, keysDeleted }, 'Analytics cache invalidated');
      }
    };

    scanAndDelete().catch((err: unknown) => {
      this.logger.warn({ err, projectId }, 'Failed to invalidate analytics cache');
    });
  }
}
