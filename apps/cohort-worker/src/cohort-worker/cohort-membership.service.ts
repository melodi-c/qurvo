import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { type Database, cohorts } from '@qurvo/db';
import { topologicalSortCohorts } from '@qurvo/cohort-query';
import { DRIZZLE } from '@qurvo/nestjs-infra';
import { type DistributedLock } from '@qurvo/distributed-lock';
import {
  DISTRIBUTED_LOCK,
  COHORT_MEMBERSHIP_INTERVAL_MS,
  COHORT_STALE_THRESHOLD_MINUTES,
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
  COHORT_INITIAL_DELAY_MS,
  COHORT_GC_EVERY_N_CYCLES,
} from '../constants';
import { CohortComputationService } from './cohort-computation.service';

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CohortMembershipService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private cycleInFlight: Promise<void> | null = null;
  private gcCycleCounter = 0;

  constructor(
    @Inject(DISTRIBUTED_LOCK) private readonly lock: DistributedLock,
    @Inject(DRIZZLE) private readonly db: Database,
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
    let staleCount = 0;
    let eligibleCount = 0;
    let cyclicCount = 0;

    try {
      // ── 1. Fetch only stale dynamic cohorts ────────────────────────────
      const staleCohorts = await this.db
        .select({
          id: cohorts.id,
          project_id: cohorts.project_id,
          definition: cohorts.definition,
          errors_calculating: cohorts.errors_calculating,
          last_error_at: cohorts.last_error_at,
        })
        .from(cohorts)
        .where(
          and(
            eq(cohorts.is_static, false),
            or(
              isNull(cohorts.membership_computed_at),
              sql`${cohorts.membership_computed_at} < NOW() - INTERVAL '1 minute' * ${COHORT_STALE_THRESHOLD_MINUTES}`,
            ),
          ),
        );

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
      const version = Date.now();
      const cohortById = new Map(eligible.map((c) => [c.id, c] as const));

      for (const { id, definition } of sorted) {
        const cohort = cohortById.get(id)!;
        try {
          await this.computation.computeMembership(id, cohort.project_id, definition, version);
          await this.computation.markComputationSuccess(id, version);
          await this.computation.recordSizeHistory(id, cohort.project_id);
          computed++;
        } catch (err) {
          try {
            await this.computation.recordError(id, err);
          } catch (recordErr) {
            this.logger.error({ err: recordErr, cohortId: id }, 'Failed to record error');
          }
          this.logger.error(
            { err, cohortId: id, projectId: cohort.project_id },
            'Failed to compute membership for cohort',
          );
        }
      }
    } finally {
      // ── 5. GC orphaned memberships (every N cycles, skips the first) ──
      await this.runGcIfDue();
      this.gcCycleCounter++;

      this.logger.info(
        { computed, stale: staleCount, eligible: eligibleCount, cyclic: cyclicCount, durationMs: Date.now() - startMs },
        'Cohort membership cycle completed',
      );

      await this.lock.release().catch((err) => this.logger.error({ err }, 'Cohort lock release failed'));
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
