import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import Redis from 'ioredis';
import { REDIS } from '@qurvo/nestjs-infra';
import { AI_QUOTA_KEY_PREFIX, currentMonthKey, previousMonthKey } from '../constants';

// Run once per hour — quota reset is not time-sensitive
const AI_QUOTA_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const AI_QUOTA_RESET_INITIAL_DELAY_MS = 10_000; // 10s

@Injectable()
export class AiQuotaResetService extends PeriodicWorkerMixin {
  protected readonly intervalMs = AI_QUOTA_RESET_INTERVAL_MS;
  protected readonly initialDelayMs = AI_QUOTA_RESET_INITIAL_DELAY_MS;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectPinoLogger(AiQuotaResetService.name) protected readonly logger: PinoLogger,
  ) {
    super();
  }

  /** @internal — exposed for integration tests */
  async runCycle(): Promise<void> {
    const prevMonth = previousMonthKey();
    const curMonth = currentMonthKey();

    // Scan for AI quota keys from the previous month and delete them
    // Pattern: ai:quota:*:{prevMonth}
    const pattern = `${AI_QUOTA_KEY_PREFIX}:*:${prevMonth}`;
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    if (deleted > 0) {
      this.logger.info({ deleted, prevMonth, curMonth }, 'AI quota counters reset for previous month');
    } else {
      this.logger.debug({ prevMonth, curMonth }, 'AI quota reset cycle: no stale keys found');
    }
  }
}
