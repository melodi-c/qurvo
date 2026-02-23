import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { type Database, cohorts, type CohortDefinition, type CohortDefinitionV2, normalizeDefinition } from '@qurvo/db';
import { buildCohortSubquery, RESOLVED_PERSON } from '@qurvo/cohort-query';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import { COHORT_MEMBERSHIP_INTERVAL_MS } from '../constants';

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
      const allCohorts = await this.db.select().from(cohorts);

      // Filter out static cohorts — they are managed manually
      const dynamicCohorts = allCohorts.filter((c) => !c.is_static);

      if (dynamicCohorts.length === 0) {
        this.logger.debug('No dynamic cohorts to compute membership for');
        return;
      }

      const version = Date.now();
      const activeIds: string[] = [];

      for (const cohort of dynamicCohorts) {
        try {
          await this.computeMembership(cohort.id, cohort.project_id, cohort.definition, version);
          activeIds.push(cohort.id);
        } catch (err) {
          this.logger.error(
            { err, cohortId: cohort.id, projectId: cohort.project_id },
            'Failed to compute membership for cohort',
          );
        }
      }

      // Garbage-collect orphaned memberships
      if (activeIds.length > 0) {
        const idList = activeIds.map((id) => `'${id}'`).join(',');
        await this.ch.command({
          query: `ALTER TABLE cohort_members DELETE WHERE cohort_id NOT IN (${idList})`,
        });
      }

      this.logger.info(
        { computed: activeIds.length, total: dynamicCohorts.length, version },
        'Cohort membership cycle completed',
      );
    } finally {
      await this.releaseLock();
    }
  }

  private async computeMembership(
    cohortId: string,
    projectId: string,
    definition: CohortDefinition | CohortDefinitionV2,
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
