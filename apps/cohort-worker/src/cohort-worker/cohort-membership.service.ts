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
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
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
import { CohortComputationService, type StaleCohort } from './cohort-computation.service';
import { MetricsService } from './metrics.service';
import type { ComputeJobData, ComputeJobResult } from './cohort-compute.processor';

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CohortMembershipService extends PeriodicWorkerMixin implements OnApplicationBootstrap {
  protected readonly intervalMs = COHORT_MEMBERSHIP_INTERVAL_MS;
  protected readonly initialDelayMs = COHORT_INITIAL_DELAY_MS;
  private readonly heartbeat: Heartbeat;

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

    let computed = 0;
    let pgFailed = 0;
    let staleCount = 0;
    let eligibleCount = 0;
    let cyclicCount = 0;

    try {
      // ── 1. Fetch only stale dynamic cohorts ────────────────────────────
      const staleCohorts = await this.computation.findStaleCohorts();

      staleCount = staleCohorts.length;

      if (staleCohorts.length === 0) return;

      // ── 2. Error backoff filter ────────────────────────────────────────
      const eligible = this.filterByBackoff(staleCohorts);

      eligibleCount = eligible.length;
      const backoffSkipped = staleCount - eligibleCount;
      if (backoffSkipped > 0) {
        this.metrics.backoffSkippedTotal.inc(backoffSkipped);
      }

      if (eligible.length === 0) return;

      // ── 3. Topological sort ────────────────────────────────────────────
      const { sorted, cyclic } = topologicalSortCohorts(
        eligible.map((c) => ({ id: c.id, definition: c.definition })),
      );

      cyclicCount = cyclic.length;

      if (cyclic.length > 0) {
        this.logger.warn({ cyclic }, 'Cyclic cohort dependencies detected — skipping');
        for (const id of cyclic) {
          await this.computation.recordError(id, new Error('Cyclic cohort dependency detected'));
        }
      }

      // ── 4. Group by dependency level and compute in parallel ─────────
      const levels = groupCohortsByLevel(sorted);
      const cohortById = new Map(eligible.map((c) => [c.id, c] as const));
      const pendingDeletions: Array<{ cohortId: string; version: number }> = [];

      for (const level of levels) {
        // Extend lock TTL before processing each level
        await this.lock.extend().catch(() => {});

        // Enqueue all cohorts in this level for parallel computation.
        // Use cohortId-based job IDs to avoid collisions when multiple cohorts
        // are enqueued within the same millisecond (Bug 1 fix).
        const jobs = await this.computeQueue.addBulk(
          level.map((c) => {
            const cohort = cohortById.get(c.id)!;
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

        // Wait for all jobs in this level to complete.
        // ttl prevents indefinite hang when Redis is unavailable or Bull worker is stuck.
        const results = await Promise.allSettled(
          jobs.map((j) =>
            j.waitUntilFinished(this.queueEvents, COHORT_JOB_TIMEOUT_MS).catch(async (err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              const isTimeout = msg.includes('timed out before finishing');
              if (isTimeout) {
                this.logger.warn(
                  { jobId: j.id, ttlMs: COHORT_JOB_TIMEOUT_MS },
                  'Cohort compute job timed out — Redis/Bull may be unavailable',
                );
                await this.computation
                  .recordError(j.data.cohortId, new Error('Compute job timed out: ' + msg))
                  .catch(() => {});
              }
              throw err;
            }),
          ),
        );

        // Collect results
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const result = r.value as ComputeJobResult;
            computed += result.success ? 1 : 0;
            pgFailed += result.pgFailed ? 1 : 0;
            if (result.success && result.version !== undefined) {
              pendingDeletions.push({ cohortId: result.cohortId, version: result.version });
            }
          }
          // rejected = job threw unexpectedly or timed out
        }
      }

      // ── 5. Batch-delete old versions (single CH mutation) ────────────
      if (pendingDeletions.length > 0) {
        await this.computation
          .deleteOldVersions(pendingDeletions)
          .catch((err) => this.logger.error({ err }, 'Batch deletion of old cohort versions failed'));
      }
    } finally {
      // ── 6. GC orphaned memberships (every N cycles, persisted in Redis) ──
      await this.runGcIfDue();

      stopTimer();
      this.metrics.cyclesTotal.inc();
      if (computed > 0) {
        this.metrics.computedTotal.inc(computed);
      }

      this.logger.info(
        { computed, pgFailed, stale: staleCount, eligible: eligibleCount, cyclic: cyclicCount, durationMs: Date.now() - startMs },
        'Cohort membership cycle completed',
      );

      await this.lock.release().catch((err) => this.logger.error({ err }, 'Cohort lock release failed'));
    }
  }

  private filterByBackoff(staleCohorts: StaleCohort[]): StaleCohort[] {
    const now = Date.now();
    return staleCohorts.filter((c) => {
      if (c.errors_calculating === 0 || !c.last_error_at) return true;
      const exponent = Math.min(c.errors_calculating, COHORT_ERROR_BACKOFF_MAX_EXPONENT);
      const backoffMs = Math.pow(2, exponent) * COHORT_ERROR_BACKOFF_BASE_MINUTES * 60_000;
      return now >= c.last_error_at.getTime() + backoffMs;
    });
  }

  private async runGcIfDue(): Promise<void> {
    // Increment counter in Redis so it survives worker restarts (Bug 2 fix).
    // INCR returns the new value after increment (1-based).
    const counter = await this.redis.incr(COHORT_GC_CYCLE_REDIS_KEY);
    if (counter % COHORT_GC_EVERY_N_CYCLES !== 0) return;
    await this.computation
      .gcOrphanedMemberships()
      .catch((err) => this.logger.error({ err }, 'Orphan GC failed'));
  }
}
