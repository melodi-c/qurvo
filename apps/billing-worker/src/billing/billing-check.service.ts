import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { Heartbeat } from '@qurvo/heartbeat';
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
  HEARTBEAT_PATH,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_LOOP_STALE_MS,
  billingCounterKey,
} from '../constants';
import { MetricsService } from './metrics.service';

@Injectable()
export class BillingCheckService extends PeriodicWorkerMixin implements OnApplicationBootstrap {
  protected readonly intervalMs = BILLING_CHECK_INTERVAL_MS;
  protected readonly initialDelayMs = BILLING_INITIAL_DELAY_MS;
  private readonly heartbeat: Heartbeat;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(BillingCheckService.name) protected readonly logger: PinoLogger,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {
    super();
    this.heartbeat = new Heartbeat({
      path: HEARTBEAT_PATH,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      staleMs: HEARTBEAT_LOOP_STALE_MS,
      onStale: (loopAge) => this.logger.warn({ loopAge }, 'Billing-worker loop stale, skipping heartbeat'),
    });
  }

  override onApplicationBootstrap() {
    super.onApplicationBootstrap();
    this.heartbeat.start();
  }

  override async stop(): Promise<void> {
    await super.stop();
    this.heartbeat.stop();
  }

  /** @internal — exposed for integration tests */
  async runCycle(): Promise<void> {
    this.heartbeat.touch();
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
    const overLimit = this.findOverLimitProjects(rows, counterValues);

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

  private findOverLimitProjects(
    rows: { projectId: string; eventsLimit: number | null }[],
    counterValues: (string | null)[],
  ): string[] {
    const result: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const limit = rows[i].eventsLimit ?? 0;
      const raw = counterValues[i];
      const count = raw !== null ? parseInt(raw, 10) : 0;
      if (!Number.isNaN(count) && count >= limit) {
        result.push(rows[i].projectId);
      }
    }
    return result;
  }
}
