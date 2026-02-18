import { Injectable, Inject, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { lt } from 'drizzle-orm';
import { sessions } from '@shot/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@shot/db';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class SessionCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async cleanup() {
    try {
      await this.db
        .delete(sessions)
        .where(lt(sessions.expires_at, new Date()));
      this.logger.log('Expired sessions cleaned up');
    } catch (err) {
      this.logger.error({ err }, 'Failed to clean up expired sessions');
    }
  }
}
