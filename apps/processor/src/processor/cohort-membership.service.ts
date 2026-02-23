import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { type Database, cohorts, type CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery, RESOLVED_PERSON } from '@qurvo/cohort-query';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import {
  COHORT_MEMBERSHIP_INTERVAL_MS,
  COHORT_STALE_THRESHOLD_MINUTES,
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
} from '../constants';
import { topologicalSortCohorts } from './cohort-toposort';

// ── Service ──────────────────────────────────────────────────────────────────

const LOCK_KEY = 'cohort_membership:lock';
const LOCK_TTL_SECONDS = 300;
const INITIAL_DELAY_MS = 30_000;

@Injectable()
export class CohortMembershipService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private readonly instanceId = randomUUID();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(CohortMembershipService.name)
    private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => {
      this.runCycle().catch((err) =>
        this.logger.error({ err }, 'Initial cohort membership cycle failed'),
      );
    }, INITIAL_DELAY_MS);

    this.timer = setInterval(() => {
      this.runCycle().catch((err) =>
        this.logger.error({ err }, 'Cohort membership cycle failed'),
      );
    }, COHORT_MEMBERSHIP_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCycle(): Promise<void> {
    const hasLock = await this.tryAcquireLock();
    if (!hasLock) {
      this.logger.debug('Cohort membership cycle skipped: another instance holds the lock');
      return;
    }

    try {
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

      if (staleCohorts.length === 0) {
        this.logger.debug('No stale dynamic cohorts to recompute');
        return;
      }

      // ── 2. Error backoff filter ─────────────────────────────────────────
      const now = Date.now();
      const eligible = staleCohorts.filter((c) => {
        if (c.errors_calculating === 0 || !c.last_error_at) return true;
        const exponent = Math.min(c.errors_calculating, COHORT_ERROR_BACKOFF_MAX_EXPONENT);
        const backoffMs = Math.pow(2, exponent) * COHORT_ERROR_BACKOFF_BASE_MINUTES * 60_000;
        return now >= c.last_error_at.getTime() + backoffMs;
      });

      if (eligible.length === 0) {
        this.logger.debug('All stale cohorts are in error backoff');
        return;
      }

      // ── 3. Topological sort ─────────────────────────────────────────────
      const { sorted, cyclic } = topologicalSortCohorts(
        eligible.map((c) => ({ id: c.id, definition: c.definition })),
      );

      if (cyclic.length > 0) {
        this.logger.warn({ cyclic }, 'Cyclic cohort dependencies detected — skipping');
      }

      // ── 4. Compute each cohort ──────────────────────────────────────────
      const version = Date.now();
      let computed = 0;

      for (const { id, definition } of sorted) {
        const cohort = eligible.find((c) => c.id === id)!;
        try {
          await this.computeMembership(id, cohort.project_id, definition, version);
          await this.recordSuccess(id);
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

      // ── 5. Garbage-collect orphaned memberships ─────────────────────────
      // Use ALL dynamic cohort IDs (not just recomputed ones) to avoid
      // deleting memberships of fresh cohorts that weren't in this cycle.
      const allDynamic = await this.db
        .select({ id: cohorts.id })
        .from(cohorts)
        .where(eq(cohorts.is_static, false));

      const allDynamicIds = allDynamic.map((c) => c.id);
      if (allDynamicIds.length > 0) {
        const idList = allDynamicIds.map((id) => `'${id}'`).join(',');
        await this.ch.command({
          query: `ALTER TABLE cohort_members DELETE WHERE cohort_id NOT IN (${idList})`,
        });
      }

      this.logger.info(
        { computed, stale: staleCohorts.length, eligible: eligible.length, version },
        'Cohort membership cycle completed',
      );
    } finally {
      await this.releaseLock();
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
        '${cohortId}' AS cohort_id,
        '${projectId}' AS project_id,
        person_id,
        ${version} AS version
      FROM (${subquery})`;

    await this.ch.query({
      query: insertSql,
      query_params: queryParams,
    });

    // Remove old versions
    await this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id = '${cohortId}' AND version < ${version}`,
    });

    // Update PostgreSQL tracking columns
    await this.db
      .update(cohorts)
      .set({
        membership_version: version,
        membership_computed_at: new Date(),
      })
      .where(eq(cohorts.id, cohortId));

    this.logger.debug({ cohortId, projectId, version }, 'Computed cohort membership');
  }

  private async recordSuccess(cohortId: string): Promise<void> {
    await this.db
      .update(cohorts)
      .set({
        errors_calculating: 0,
        last_error_at: null,
        last_error_message: null,
      })
      .where(eq(cohorts.id, cohortId));
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

  private async tryAcquireLock(): Promise<boolean> {
    const result = await this.redis.set(
      LOCK_KEY,
      this.instanceId,
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );
    return result !== null;
  }

  private async releaseLock(): Promise<void> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, LOCK_KEY, this.instanceId);
  }
}
