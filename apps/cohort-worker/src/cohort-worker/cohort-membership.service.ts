import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { type Database, cohorts } from '@qurvo/db';
import { topologicalSortCohorts } from '@qurvo/cohort-query';
import { REDIS, DRIZZLE } from '@qurvo/nestjs-infra';
import {
  COHORT_MEMBERSHIP_INTERVAL_MS,
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
  COHORT_LOCK_KEY,
  COHORT_LOCK_TTL_SECONDS,
  COHORT_INITIAL_DELAY_MS,
  COHORT_GC_EVERY_N_CYCLES,
} from '../constants';
import { DistributedLock } from '@qurvo/distributed-lock';
import { CohortComputationService } from './cohort-computation.service';

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CohortMembershipService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private cycleInFlight: Promise<void> | null = null;
  private gcCycleCounter = 0;
  private readonly lock: DistributedLock;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(CohortMembershipService.name)
    private readonly logger: PinoLogger,
    private readonly computation: CohortComputationService,
  ) {
    this.lock = new DistributedLock(redis, COHORT_LOCK_KEY, randomUUID(), COHORT_LOCK_TTL_SECONDS);
  }

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
    this.cycleInFlight = this.runCycle().catch((err) => {
      this.logger.error({ err }, 'Cohort membership cycle failed');
    });
    await this.cycleInFlight;
    this.cycleInFlight = null;
    if (!this.stopped) {
      this.timer = setTimeout(() => this.scheduledCycle(), COHORT_MEMBERSHIP_INTERVAL_MS);
    }
  }

  private async runCycle(): Promise<void> {
    const hasLock = await this.lock.acquire();
    if (!hasLock) {
      this.logger.debug('Cohort membership cycle skipped: another instance holds the lock');
      return;
    }

    try {
      let computed = 0;
      let eligibleCount = 0;

      // ── 1. Selective: fetch only stale dynamic cohorts ──────────────────
      const staleCohorts = await this.db
        .select()
        .from(cohorts)
        .where(
          and(
            eq(cohorts.is_static, false),
            or(
              isNull(cohorts.membership_computed_at),
              // COHORT_STALE_THRESHOLD_MINUTES = 15
              sql`${cohorts.membership_computed_at} < NOW() - INTERVAL '15 minutes'`,
            ),
          ),
        );

      if (staleCohorts.length > 0) {
        // ── 2. Error backoff filter ───────────────────────────────────────
        const now = Date.now();
        const eligible = staleCohorts.filter((c) => {
          if (c.errors_calculating === 0 || !c.last_error_at) return true;
          const exponent = Math.min(c.errors_calculating, COHORT_ERROR_BACKOFF_MAX_EXPONENT);
          const backoffMs = Math.pow(2, exponent) * COHORT_ERROR_BACKOFF_BASE_MINUTES * 60_000;
          return now >= c.last_error_at.getTime() + backoffMs;
        });

        eligibleCount = eligible.length;

        if (eligible.length > 0) {
          // ── 3. Topological sort ───────────────────────────────────────────
          const { sorted, cyclic } = topologicalSortCohorts(
            eligible.map((c) => ({ id: c.id, definition: c.definition })),
          );

          if (cyclic.length > 0) {
            this.logger.warn({ cyclic }, 'Cyclic cohort dependencies detected — skipping');
          }

          // ── 4. Compute each cohort ────────────────────────────────────────
          const version = Date.now();
          const eligibleMap = new Map(eligible.map((c) => [c.id, c]));

          for (const { id, definition } of sorted) {
            const cohort = eligibleMap.get(id)!;
            try {
              await this.computation.computeMembership(id, cohort.project_id, definition, version);
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
        } else {
          this.logger.debug('All stale cohorts are in error backoff');
        }
      } else {
        this.logger.debug('No stale dynamic cohorts to recompute');
      }

      // ── 5. Garbage-collect orphaned memberships (every N cycles) ──────
      if (this.gcCycleCounter % COHORT_GC_EVERY_N_CYCLES === 0) {
        await this.computation.gcOrphanedMemberships().catch((err) =>
          this.logger.error({ err }, 'Orphan GC failed'),
        );
      }
      this.gcCycleCounter++;

      this.logger.info(
        { computed, stale: staleCohorts.length, eligible: eligibleCount },
        'Cohort membership cycle completed',
      );
    } finally {
      await this.lock.release().catch((err) => this.logger.error({ err }, 'Cohort lock release failed'));
    }
  }
}
