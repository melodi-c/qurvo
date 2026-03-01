import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { Heartbeat } from '@qurvo/heartbeat';
import { topologicalSortCohorts, groupCohortsByLevel } from '@qurvo/cohort-query';
import { type DistributedLock } from '@qurvo/distributed-lock';
import { REDIS } from '@qurvo/nestjs-infra';
import {
  COHORT_MEMBERSHIP_INTERVAL_MS,
  COHORT_INITIAL_DELAY_MS,
  COHORT_GC_EVERY_N_CYCLES,
  COHORT_COMPUTE_QUEUE,
  COHORT_JOB_TIMEOUT_MS,
  HEARTBEAT_PATH,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_LOOP_STALE_MS,
  COHORT_GC_CYCLE_REDIS_KEY,
} from '../constants';
import { DISTRIBUTED_LOCK, COMPUTE_QUEUE_EVENTS } from './tokens';
import { CohortComputationService } from './cohort-computation.service';
import { filterByBackoff } from './backoff';
import { MetricsService } from './metrics.service';
import type { CohortConditionGroup } from '@qurvo/db';
import type { ComputeJobData, ComputeJobResult } from './cohort-compute.processor';

// Service

@Injectable()
export class CohortMembershipService extends PeriodicWorkerMixin implements OnApplicationBootstrap {
  protected readonly intervalMs = COHORT_MEMBERSHIP_INTERVAL_MS;
  protected readonly initialDelayMs = COHORT_INITIAL_DELAY_MS;
  private readonly heartbeat: Heartbeat;

  // eslint-disable-next-line max-params -- NestJS DI requires separate constructor params
  constructor(
    @Inject(DISTRIBUTED_LOCK) private readonly lock: DistributedLock,
    @InjectQueue(COHORT_COMPUTE_QUEUE) private readonly computeQueue: Queue<ComputeJobData, ComputeJobResult>,
    @Inject(COMPUTE_QUEUE_EVENTS) private readonly queueEvents: QueueEvents,
    @InjectPinoLogger(CohortMembershipService.name)
    protected readonly logger: PinoLogger,
    private readonly computation: CohortComputationService,
    private readonly metrics: MetricsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super();
    this.heartbeat = new Heartbeat({
      path: HEARTBEAT_PATH,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      staleMs: HEARTBEAT_LOOP_STALE_MS,
      onStale: (loopAge) => this.logger.warn({ loopAge }, 'Cohort-worker loop stale, skipping heartbeat'),
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
    const stopTimer = this.metrics.cycleDurationMs.startTimer();
    const startMs = Date.now();

    const hasLock = await this.lock.acquire();
    if (!hasLock) {
      this.logger.debug('Cohort membership cycle skipped: another instance holds the lock');
      return;
    }

    const stats = { computed: 0, pgFailed: 0, staleCount: 0, eligibleCount: 0, cyclicCount: 0 };

    try {
      await this.processCohorts(stats);
    } finally {
      await this.finalizeCycle(stopTimer, stats, startMs);
    }
  }

  private async processCohorts(stats: {
    computed: number;
    pgFailed: number;
    staleCount: number;
    eligibleCount: number;
    cyclicCount: number;
  }): Promise<void> {
    // 1. Fetch only stale dynamic cohorts
    const staleCohorts = await this.computation.findStaleCohorts();
    stats.staleCount = staleCohorts.length;
    if (staleCohorts.length === 0) { return; }

    // 2. Error backoff filter
    const eligible = filterByBackoff(staleCohorts);
    stats.eligibleCount = eligible.length;
    this.metrics.backoffSkippedTotal.inc(stats.staleCount - stats.eligibleCount);
    if (eligible.length === 0) { return; }

    // 3. Topological sort
    const { sorted, cyclic } = topologicalSortCohorts(
      eligible.map((c) => ({ id: c.id, definition: c.definition })),
    );
    stats.cyclicCount = cyclic.length;
    await this.recordCyclicErrors(cyclic);

    // 4. Group by dependency level and compute in parallel
    const levels = groupCohortsByLevel(sorted);
    const cohortById = new Map(eligible.map((c) => [c.id, c] as const));
    const pendingDeletions: Array<{ cohortId: string; version: number }> = [];

    for (const level of levels) {
      const extended = await this.lock.extend().catch(() => false);
      if (!extended) {
        this.logger.warn('Lock lost during cohort cycle — aborting remaining levels');
        break;
      }
      await this.processLevel(level, cohortById, stats, pendingDeletions);
    }

    // 5. Batch-delete old versions (single CH mutation)
    if (pendingDeletions.length > 0) {
      await this.computation
        .deleteOldVersions(pendingDeletions)
        .catch((err) => this.logger.error({ err }, 'Batch deletion of old cohort versions failed'));
    }
  }

  private async recordCyclicErrors(cyclic: string[]): Promise<void> {
    if (cyclic.length === 0) { return; }
    this.logger.warn({ cyclic }, 'Cyclic cohort dependencies detected — skipping');
    for (const id of cyclic) {
      await this.computation.recordError(id, new Error('Cyclic cohort dependency detected'));
    }
  }

  private async processLevel(
    level: Array<{ id: string }>,
    cohortById: Map<string, { id: string; project_id: string; definition: CohortConditionGroup }>,
    stats: { computed: number; pgFailed: number },
    pendingDeletions: Array<{ cohortId: string; version: number }>,
  ): Promise<void> {
    const jobs = await this.computeQueue.addBulk(
      level.map((c) => {
        const cohort = cohortById.get(c.id);
        if (!cohort) { throw new Error(`Cohort ${c.id} not found in eligible set`); }
        return {
          name: 'compute',
          opts: { jobId: `${cohort.id}-${Date.now()}` },
          data: {
            cohortId: cohort.id,
            projectId: cohort.project_id,
            definition: cohort.definition,
          } satisfies ComputeJobData,
        };
      }),
    );

    const results = await Promise.allSettled(
      jobs.map((j) =>
        j.waitUntilFinished(this.queueEvents, COHORT_JOB_TIMEOUT_MS).catch(async (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('timed out before finishing')) {
            this.logger.warn({ jobId: j.id, ttlMs: COHORT_JOB_TIMEOUT_MS }, 'Cohort compute job timed out');
            await this.computation.recordError(j.data.cohortId, new Error('Compute job timed out: ' + msg)).catch(() => {});
          }
          throw err;
        }),
      ),
    );

    await this.collectResults(results, jobs, stats, pendingDeletions);
  }

  private async collectResults(
    results: PromiseSettledResult<ComputeJobResult>[],
    jobs: Array<{ id?: string; data: ComputeJobData }>,
    stats: { computed: number; pgFailed: number },
    pendingDeletions: Array<{ cohortId: string; version: number }>,
  ): Promise<void> {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        this.tallyFulfilledResult(r.value, stats, pendingDeletions);
      } else {
        await this.handleRejectedResult(r.reason, jobs[i]);
      }
    }
  }

  private tallyFulfilledResult(
    value: ComputeJobResult,
    stats: { computed: number; pgFailed: number },
    pendingDeletions: Array<{ cohortId: string; version: number }>,
  ): void {
    stats.computed += value.success ? 1 : 0;
    stats.pgFailed += value.pgFailed ? 1 : 0;
    if (value.success && value.version !== undefined) {
      pendingDeletions.push({ cohortId: value.cohortId, version: value.version });
    }
  }

  private async handleRejectedResult(
    reason: unknown,
    job: { id?: string; data: ComputeJobData },
  ): Promise<void> {
    this.logger.error({ err: reason, cohortId: job.data.cohortId, jobId: job.id }, 'Cohort compute job rejected unexpectedly');
    await this.computation.recordError(job.data.cohortId, reason).catch(() => {});
  }

  private async finalizeCycle(
    stopTimer: () => void,
    stats: { computed: number; pgFailed: number; staleCount: number; eligibleCount: number; cyclicCount: number },
    startMs: number,
  ): Promise<void> {
    await this.runGcIfDue();
    stopTimer();
    this.metrics.cyclesTotal.inc();
    if (stats.computed > 0) {
      this.metrics.computedTotal.inc(stats.computed);
    }
    this.logger.info(
      { ...stats, durationMs: Date.now() - startMs },
      'Cohort membership cycle completed',
    );
    await this.lock.release().catch((err) => this.logger.error({ err }, 'Cohort lock release failed'));
  }

  private async runGcIfDue(): Promise<void> {
    // Increment counter in Redis so it survives worker restarts (Bug 2 fix).
    // INCR returns the new value after increment (1-based).
    const counter = await this.redis.incr(COHORT_GC_CYCLE_REDIS_KEY);
    if (counter % COHORT_GC_EVERY_N_CYCLES !== 0) {return;}
    await this.computation
      .gcOrphanedMemberships()
      .catch((err) => this.logger.error({ err }, 'Orphan GC failed'));
  }
}
