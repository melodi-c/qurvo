import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { eq, sql } from 'drizzle-orm';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { type Database, cohorts, type CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery } from '@qurvo/cohort-query';
import { CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';

@Injectable()
export class CohortComputationService {
  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(CohortComputationService.name)
    private readonly logger: PinoLogger,
  ) {}

  async computeMembership(
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

  async recordError(cohortId: string, err: unknown): Promise<void> {
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

  async recordSizeHistory(cohortId: string, projectId: string): Promise<void> {
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

  async gcOrphanedMemberships(): Promise<void> {
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
      this.logger.warn('No dynamic cohorts found — deleting all cohort_members rows (orphan GC)');
      await this.ch.command({
        query: `ALTER TABLE cohort_members DELETE WHERE 1 = 1`,
      });
    }
  }
}
