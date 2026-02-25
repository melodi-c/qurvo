import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { topologicalSortCohorts } from '@qurvo/cohort-query';
import { type DistributedLock } from '@qurvo/distributed-lock';
import {
  COHORT_MEMBERSHIP_INTERVAL_MS,
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
  COHORT_INITIAL_DELAY_MS,
  COHORT_GC_EVERY_N_CYCLES,
} from '../constants';
import { DISTRIBUTED_LOCK } from './tokens';
import { CohortComputationService, type StaleCohort } from './cohort-computation.service';

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CohortMembershipService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private cycleInFlight: Promise<void> | null = null;
  private gcCycleCounter = 0;

  constructor(
    @Inject(DISTRIBUTED_LOCK) private readonly lock: DistributedLock,
    @InjectPinoLogger(CohortMembershipService.name)
    private readonly logger: PinoLogger,
    private readonly computation: CohortComputationService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setTimeout(() => this.scheduledCycle(), COHORT_INITIAL_DELAY_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.cycleInFlight) {
      await this.cycleInFlight;
    }
  }

  private async scheduledCycle() {
    this.cycleInFlight = this.runCycle();
    try {
      await this.cycleInFlight;
    } catch (err) {
      this.logger.error({ err }, 'Cohort membership cycle failed');
    } finally {
      this.cycleInFlight = null;
      if (!this.stopped) {
        this.timer = setTimeout(() => this.scheduledCycle(), COHORT_MEMBERSHIP_INTERVAL_MS);
      }
    }
  }

  /** @internal — exposed for integration tests */
  async runCycle(): Promise<void> {
    const startMs = Date.now();

    const hasLock = await this.lock.acquire();
    if (!hasLock) {
      this.logger.debug('Cohort membership cycle skipped: another instance holds the lock');
      // gcCycleCounter not incremented — GC only runs by the lock holder
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

      if (eligible.length === 0) return;

      // ── 3. Topological sort ────────────────────────────────────────────
      const { sorted, cyclic } = topologicalSortCohorts(
        eligible.map((c) => ({ id: c.id, definition: c.definition })),
      );

      cyclicCount = cyclic.length;

      if (cyclic.length > 0) {
        this.logger.warn({ cyclic }, 'Cyclic cohort dependencies detected — skipping');
        for (const id of cyclic) {
          await this.computation
            .recordError(id, new Error('Cyclic cohort dependency detected'))
            .catch((err) => this.logger.error({ err, cohortId: id }, 'Failed to record cyclic dependency error'));
        }
      }

      // ── 4. Compute each cohort ─────────────────────────────────────────
      const cohortById = new Map(eligible.map((c) => [c.id, c] as const));

      for (const { id, definition } of sorted) {
        const result = await this.processOneCohort(id, cohortById.get(id)!, definition);
        computed += result.computed;
        pgFailed += result.pgFailed;
      }
    } finally {
      // ── 5. GC orphaned memberships (every N cycles, skips the first) ──
      await this.runGcIfDue();
      this.gcCycleCounter++;

      this.logger.info(
        { computed, pgFailed, stale: staleCount, eligible: eligibleCount, cyclic: cyclicCount, durationMs: Date.now() - startMs },
        'Cohort membership cycle completed',
      );

      await this.lock.release().catch((err) => this.logger.error({ err }, 'Cohort lock release failed'));
    }
  }

  private async processOneCohort(
    id: string,
    cohort: StaleCohort,
    definition: StaleCohort['definition'],
  ): Promise<{ computed: number; pgFailed: number }> {
    try {
      const version = Date.now();
      await this.computation.computeMembership(id, cohort.project_id, definition, version);
      const pgOk = await this.computation.markComputationSuccess(id, version);
      if (pgOk) {
        await this.computation.recordSizeHistory(id, cohort.project_id);
      }
      return { computed: 1, pgFailed: pgOk ? 0 : 1 };
    } catch (err) {
      await this.computation
        .recordError(id, err)
        .catch((recordErr) => this.logger.error({ err: recordErr, cohortId: id }, 'Failed to record error'));
      this.logger.error(
        { err, cohortId: id, projectId: cohort.project_id },
        'Failed to compute membership for cohort',
      );
      return { computed: 0, pgFailed: 0 };
    }
  }

  private filterByBackoff<T extends { errors_calculating: number; last_error_at: Date | null }>(
    staleCohorts: T[],
  ): T[] {
    const now = Date.now();
    return staleCohorts.filter((c) => {
      if (c.errors_calculating === 0 || !c.last_error_at) return true;
      const exponent = Math.min(c.errors_calculating, COHORT_ERROR_BACKOFF_MAX_EXPONENT);
      const backoffMs = Math.pow(2, exponent) * COHORT_ERROR_BACKOFF_BASE_MINUTES * 60_000;
      return now >= c.last_error_at.getTime() + backoffMs;
    });
  }

  private async runGcIfDue(): Promise<void> {
    if (this.gcCycleCounter === 0 || this.gcCycleCounter % COHORT_GC_EVERY_N_CYCLES !== 0) return;
    await this.computation
      .gcOrphanedMemberships()
      .catch((err) => this.logger.error({ err }, 'Orphan GC failed'));
  }
}
