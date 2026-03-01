import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { eq, and, or, isNull, lt, sql } from 'drizzle-orm';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import { type Database, cohorts, type CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery } from '@qurvo/cohort-query';
import { select, col, namedParam } from '@qurvo/ch-query';
import { CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';
import { COHORT_STALE_THRESHOLD_MINUTES, COHORT_MAX_ERRORS } from '../constants';

export interface StaleCohort {
  id: string;
  project_id: string;
  definition: CohortConditionGroup;
  errors_calculating: number;
  last_error_at: Date | null;
}

@Injectable()
export class CohortComputationService {
  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(CohortComputationService.name)
    private readonly logger: PinoLogger,
  ) {}

  async findStaleCohorts(): Promise<StaleCohort[]> {
    return this.db
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
          sql`${cohorts.errors_calculating} < ${COHORT_MAX_ERRORS}`,
          or(
            isNull(cohorts.membership_computed_at),
            sql`${cohorts.membership_computed_at} < NOW() - INTERVAL '1 minute' * ${COHORT_STALE_THRESHOLD_MINUTES}`,
          ),
        ),
      );
  }

  async computeMembership(
    cohortId: string,
    projectId: string,
    definition: CohortConditionGroup,
    version: number,
  ): Promise<void> {
    const queryParams: Record<string, unknown> = { project_id: projectId };
    const cohortNode = buildCohortSubquery(definition, 0, 'project_id', queryParams);

    // Build the SELECT that will feed INTO cohort_members
    const selectNode = select(
      namedParam('cm_cohort_id', 'UUID', cohortId).as('cohort_id'),
      namedParam('cm_project_id', 'UUID', projectId).as('project_id'),
      col('person_id'),
      namedParam('cm_version', 'UInt64', version).as('version'),
    )
      .from(cohortNode)
      .build();

    await new ChQueryExecutor(this.ch).insertFromSelect(
      'cohort_members',
      ['cohort_id', 'project_id', 'person_id', 'version'],
      selectNode,
      {
        max_execution_time: 600,
        optimize_on_insert: 0,
        max_bytes_before_external_group_by: '1000000000',
        max_bytes_before_external_sort: '1000000000',
      },
    );

    this.logger.debug({ cohortId, projectId, version }, 'Computed cohort membership');
  }

  async deleteOldVersions(deletions: Array<{ cohortId: string; version: number }>): Promise<void> {
    if (deletions.length === 0) {return;}

    const conditions = deletions.map((_, i) => {
      return `(cohort_id = {del_cid_${i}:UUID} AND version < {del_ver_${i}:UInt64})`;
    });

    const queryParams: Record<string, unknown> = {};
    for (let i = 0; i < deletions.length; i++) {
      queryParams[`del_cid_${i}`] = deletions[i].cohortId;
      queryParams[`del_ver_${i}`] = deletions[i].version;
    }

    await this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE ${conditions.join(' OR ')}`,
      query_params: queryParams,
    });
  }

  /** Update PG tracking columns + reset error state. Separated from computeMembership
   *  so that a transient PG failure doesn't trigger error backoff for a successful CH write.
   *  Returns false if PG update failed or if a newer version already exists (caller should
   *  skip deleteOldVersions + recordSizeHistory in both cases). */
  async markComputationSuccess(cohortId: string, version: number): Promise<boolean> {
    try {
      const rows = await this.db
        .update(cohorts)
        .set({
          membership_version: version,
          membership_computed_at: new Date(),
          errors_calculating: 0,
          last_error_at: null,
          last_error_message: null,
        })
        .where(
          and(
            eq(cohorts.id, cohortId),
            or(isNull(cohorts.membership_version), lt(cohorts.membership_version, version)),
          ),
        )
        .returning({ id: cohorts.id });

      if (rows.length === 0) {
        this.logger.warn(
          { cohortId, version },
          'markComputationSuccess skipped: a newer membership_version already exists (stale write from older worker instance)',
        );
        return false;
      }

      return true;
    } catch (err) {
      this.logger.warn(
        { err, cohortId },
        'PG tracking update failed after successful CH computation',
      );
      return false;
    }
  }

  async recordError(cohortId: string, err: unknown): Promise<boolean> {
    const message = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';
    try {
      await this.db
        .update(cohorts)
        .set({
          errors_calculating: sql`${cohorts.errors_calculating} + 1`,
          last_error_at: new Date(),
          last_error_message: message,
        })
        .where(eq(cohorts.id, cohortId));
      return true;
    } catch (pgErr) {
      this.logger.warn({ err: pgErr, cohortId }, 'PG error recording failed');
      return false;
    }
  }

  async recordSizeHistory(cohortId: string, projectId: string, version: number): Promise<void> {
    try {
      await this.ch.command({
        query: `
          INSERT INTO cohort_membership_history (project_id, cohort_id, date, count)
          SELECT
            {project_id:UUID},
            {cohort_id:UUID},
            today(),
            count()
          FROM cohort_members
          WHERE project_id = {project_id:UUID}
            AND cohort_id = {cohort_id:UUID}
            AND version = {version:UInt64}`,
        query_params: { project_id: projectId, cohort_id: cohortId, version },
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

    if (allDynamicIds.length === 0) {
      // No dynamic cohorts in PG. This could be a legitimate empty state or a race condition
      // (cohorts just deleted from PG while their CH rows were freshly inserted).
      // Skipping rather than deleting all rows prevents data loss in the race scenario.
      this.logger.debug('Orphan GC: skipped — no dynamic cohorts in PG');
      return;
    }

    await this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id NOT IN ({ids:Array(UUID)})`,
      query_params: { ids: allDynamicIds },
    });
  }
}
