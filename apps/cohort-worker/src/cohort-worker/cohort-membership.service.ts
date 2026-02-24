import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { type Database, cohorts, type CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery, RESOLVED_PERSON, topologicalSortCohorts } from '@qurvo/cohort-query';
import { REDIS, CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';
import {
  COHORT_MEMBERSHIP_INTERVAL_MS,
  COHORT_STALE_THRESHOLD_MINUTES,
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
} from '../constants';
import { DistributedLock } from '@qurvo/distributed-lock';

// ── Service ──────────────────────────────────────────────────────────────────

const LOCK_KEY = 'cohort_membership:lock';
const LOCK_TTL_SECONDS = 300;
const INITIAL_DELAY_MS = 30_000;

@Injectable()
export class CohortMembershipService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private cycleInFlight: Promise<void> | null = null;
  private readonly lock: DistributedLock;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(CohortMembershipService.name)
    private readonly logger: PinoLogger,
  ) {
    this.lock = new DistributedLock(redis, LOCK_KEY, randomUUID(), LOCK_TTL_SECONDS);
  }

  onApplicationBootstrap() {
    this.timer = setTimeout(() => this.scheduledCycle(), INITIAL_DELAY_MS);
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
    const cycle = this.runCycle().catch((err) => {
      this.logger.error({ err }, 'Cohort membership cycle failed');
    });
    this.cycleInFlight = cycle;
    await cycle;
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
      let staleCount = 0;
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
              sql`${cohorts.membership_computed_at} < NOW() - INTERVAL '${sql.raw(String(COHORT_STALE_THRESHOLD_MINUTES))} minutes'`,
            ),
          ),
        );

      staleCount = staleCohorts.length;

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
              await this.computeMembership(id, cohort.project_id, definition, version);
              await this.recordSizeHistory(id, cohort.project_id);
              computed++;
            } catch (err) {
              await this.recordError(id, err);
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

      // ── 5. Garbage-collect orphaned memberships ─────────────────────────
      // Always runs: deleted cohorts should be cleaned up even when no stale cohorts exist.
      await this.gcOrphanedMemberships();

      this.logger.info(
        { computed, stale: staleCount, eligible: eligibleCount },
        'Cohort membership cycle completed',
      );
    } finally {
      await this.lock.release().catch((err) => this.logger.warn({ err }, 'Cohort lock release failed'));
    }
  }

  private async gcOrphanedMemberships(): Promise<void> {
    const allDynamic = await this.db
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(eq(cohorts.is_static, false));

    const allDynamicIds = allDynamic.map((c) => c.id);

    if (allDynamicIds.length > 0) {
      await this.ch.command({
        query: `ALTER TABLE cohort_members DELETE WHERE cohort_id NOT IN ({ids:Array(UUID)})`,
        query_params: { ids: allDynamicIds },
      });
    } else {
      await this.ch.command({
        query: `ALTER TABLE cohort_members DELETE WHERE 1 = 1`,
      });
    }
  }

  private async computeMembership(
    cohortId: string,
    projectId: string,
    definition: CohortConditionGroup,
    version: number,
  ): Promise<void> {
    const queryParams: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(definition, 0, 'project_id', queryParams);

    // Insert new membership rows with current version
    const insertSql = `
      INSERT INTO cohort_members (cohort_id, project_id, person_id, version)
      SELECT
        {cm_cohort_id:UUID} AS cohort_id,
        {cm_project_id:UUID} AS project_id,
        person_id,
        {cm_version:UInt64} AS version
      FROM (${subquery})`;

    await this.ch.command({
      query: insertSql,
      query_params: { ...queryParams, cm_cohort_id: cohortId, cm_project_id: projectId, cm_version: version },
    });

    // Remove old versions
    await this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id = {cm_cohort_id:UUID} AND version < {cm_version:UInt64}`,
      query_params: { cm_cohort_id: cohortId, cm_version: version },
    });

    // Update PostgreSQL tracking columns + reset error state
    await this.db
      .update(cohorts)
      .set({
        membership_version: version,
        membership_computed_at: new Date(),
        errors_calculating: 0,
        last_error_at: null,
        last_error_message: null,
      })
      .where(eq(cohorts.id, cohortId));

    this.logger.debug({ cohortId, projectId, version }, 'Computed cohort membership');
  }

  private async recordError(cohortId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';
    await this.db
      .update(cohorts)
      .set({
        errors_calculating: sql`${cohorts.errors_calculating} + 1`,
        last_error_at: new Date(),
        last_error_message: message,
      })
      .where(eq(cohorts.id, cohortId));
  }

  private async recordSizeHistory(cohortId: string, projectId: string): Promise<void> {
    try {
      const countResult = await this.ch.query({
        query: `
          SELECT uniqExact(person_id) AS cnt
          FROM cohort_members FINAL
          WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
        query_params: { project_id: projectId, cohort_id: cohortId },
        format: 'JSONEachRow',
      });
      const rows = await countResult.json<{ cnt: string }>();
      const count = Number(rows[0]?.cnt ?? 0);

      await this.ch.insert({
        table: 'cohort_membership_history',
        values: [{ project_id: projectId, cohort_id: cohortId, date: new Date().toISOString().slice(0, 10), count }],
        format: 'JSONEachRow',
      });
    } catch (err) {
      this.logger.warn({ err, cohortId, projectId }, 'Failed to record cohort size history');
    }
  }
}
