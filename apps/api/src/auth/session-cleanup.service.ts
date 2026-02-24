import { Injectable, Inject, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { lt } from 'drizzle-orm';
import { sessions } from '@qurvo/db';
import { DistributedLock } from '@qurvo/distributed-lock';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import type { Database } from '@qurvo/db';
import type Redis from 'ioredis';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LOCK_TTL_SECONDS = 120; // 2 minutes — enough for the DELETE query

@Injectable()
export class SessionCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionCleanupService.name);
  private readonly lock: DistributedLock;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) redis: Redis,
  ) {
    this.lock = new DistributedLock(redis, 'session:cleanup:lock', randomUUID(), LOCK_TTL_SECONDS);
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async cleanup() {
    const acquired = await this.lock.acquire();
    if (!acquired) {
      this.logger.debug('Session cleanup skipped: another instance holds the lock');
      return;
    }

    try {
      await this.db
        .delete(sessions)
        .where(lt(sessions.expires_at, new Date()));
      this.logger.log('Expired sessions cleaned up');
    } catch (err) {
      this.logger.error({ err }, 'Failed to clean up expired sessions');
    } finally {
      await this.lock.release();
    }
  }
}
