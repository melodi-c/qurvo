import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import Redis from 'ioredis';
import { eq, isNotNull } from 'drizzle-orm';
import { projects, plans } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS, DRIZZLE } from '@qurvo/nestjs-infra';
import {
  BILLING_CHECK_INTERVAL_MS,
  BILLING_INITIAL_DELAY_MS,
  BILLING_SET_TTL_SECONDS,
  BILLING_QUOTA_LIMITED_KEY,
  billingCounterKey,
} from '../constants';
import { MetricsService } from './metrics.service';

@Injectable()
export class BillingCheckService extends PeriodicWorkerMixin {
  protected readonly intervalMs = BILLING_CHECK_INTERVAL_MS;
  protected readonly initialDelayMs = BILLING_INITIAL_DELAY_MS;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(BillingCheckService.name) protected readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  /** @internal — exposed for integration tests */
  async runCycle(): Promise<void> {
    const stopTimer = this.metrics.cycleDuration.startTimer();

    // 1. Get all projects with a billing limit
    const rows = await this.db
      .select({ projectId: projects.id, eventsLimit: plans.events_limit })
      .from(projects)
      .innerJoin(plans, eq(projects.plan_id, plans.id))
      .where(isNotNull(plans.events_limit));

    if (rows.length === 0) {
      // No projects with limits — clear the set if it exists
      await this.redis.del(BILLING_QUOTA_LIMITED_KEY);
      this.metrics.projectsCheckedTotal.inc(0);
      this.metrics.quotaLimitedCount.set(0);
      stopTimer();
      this.metrics.cyclesTotal.inc();
      return;
    }

    // 2. Batch-read billing counters (single MGET)
    const now = new Date();
    const counterKeys = rows.map((r) => billingCounterKey(r.projectId, now));
    const counterValues = await this.redis.mget(...counterKeys);

    // 3. Determine which projects are over limit
    const overLimit: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const limit = rows[i].eventsLimit!;
      const count = counterValues[i] !== null ? parseInt(counterValues[i]!, 10) : 0;
      if (!Number.isNaN(count) && count >= limit) {
        overLimit.push(rows[i].projectId);
      }
    }

    // 4. Atomically replace the quota_limited set
    const pipeline = this.redis.multi();
    pipeline.del(BILLING_QUOTA_LIMITED_KEY);
    if (overLimit.length > 0) {
      pipeline.sadd(BILLING_QUOTA_LIMITED_KEY, ...overLimit);
    }
    // Safety TTL: if worker stops, set auto-expires so ingest doesn't enforce stale limits
    pipeline.expire(BILLING_QUOTA_LIMITED_KEY, BILLING_SET_TTL_SECONDS);
    await pipeline.exec();

    this.metrics.projectsCheckedTotal.inc(rows.length);
    this.metrics.quotaLimitedCount.set(overLimit.length);
    stopTimer();
    this.metrics.cyclesTotal.inc();

    this.logger.debug(
      { total: rows.length, overLimit: overLimit.length },
      'Billing check completed',
    );
  }
}
