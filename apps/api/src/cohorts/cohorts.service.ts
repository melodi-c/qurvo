import { Injectable, Inject, Logger } from '@nestjs/common';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { eq, and, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  cohorts,
  type CohortConditionGroup, type Database,
} from '@qurvo/db';
import { detectCircularDependency } from '@qurvo/cohort-query';
import { CohortNotFoundException } from './exceptions/cohort-not-found.exception';
import { countCohortMembers, countCohortMembersFromTable, countStaticCohortMembers, queryCohortSizeHistory } from './cohorts.query';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { CohortBreakdownEntry } from './cohort-breakdown.util';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

@Injectable()
export class CohortsService {
  private readonly logger = new Logger(CohortsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  async list(projectId: string) {
    return this.db
      .select()
      .from(cohorts)
      .where(eq(cohorts.project_id, projectId))
      .orderBy(cohorts.created_at);
  }

  async getById(projectId: string, cohortId: string) {
    const rows = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (rows.length === 0) throw new CohortNotFoundException();
    return rows[0];
  }

  async create(
    userId: string,
    projectId: string,
    input: {
      name: string;
      description?: string;
      definition?: CohortConditionGroup;
      is_static?: boolean;
    },
  ) {
    const definition = input.definition ?? null;
    if (!definition && !input.is_static) {
      throw new AppBadRequestException('definition is required for dynamic cohorts');
    }

    // Check circular dependency if definition references other cohorts
    if (definition) {
      await this.checkCircularDependency('', definition, projectId);
    }

    const rows = await this.db
      .insert(cohorts)
      .values({
        project_id: projectId,
        created_by: userId,
        name: input.name,
        description: input.description ?? null,
        definition: definition ?? { type: 'AND', values: [] },
        is_static: input.is_static ?? false,
      })
      .returning();

    return rows[0];
  }

  async update(
    projectId: string,
    cohortId: string,
    input: {
      name?: string;
      description?: string;
      definition?: CohortConditionGroup;
    },
  ) {
    const existing = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (existing.length === 0) throw new CohortNotFoundException();

    const definition = input.definition;

    if (definition !== undefined && existing[0].is_static) {
      throw new AppBadRequestException('Cannot set a definition on a static cohort');
    }

    if (definition) {
      await this.checkCircularDependency(cohortId, definition, projectId);
    }

    const updateData = {
      updated_at: new Date(),
      ...buildConditionalUpdate(input, ['name', 'description']),
      ...(definition !== undefined && {
        definition,
        // Reset materialized membership — force fallback until recomputation
        membership_version: null,
        membership_computed_at: null,
        // Reset error tracking — definition changed, give it a fresh chance
        errors_calculating: 0,
        last_error_at: null,
        last_error_message: null,
      }),
    };

    const rows = await this.db
      .update(cohorts)
      .set(updateData)
      .where(eq(cohorts.id, cohortId))
      .returning();

    return rows[0];
  }

  async remove(projectId: string, cohortId: string) {
    const rows = await this.db
      .delete(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)))
      .returning({ id: cohorts.id, is_static: cohorts.is_static });

    if (rows.length === 0) throw new CohortNotFoundException();

    // Fire-and-forget: clean up materialized membership rows
    this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id = {cohort_id:UUID}`,
      query_params: { cohort_id: cohortId },
    }).catch((err: unknown) => {
      this.logger.warn({ err, cohortId }, 'Failed to clean up cohort_members');
    });

    // Also clean up static cohort rows if applicable
    if (rows[0].is_static) {
      this.ch.command({
        query: `ALTER TABLE person_static_cohort DELETE WHERE cohort_id = {cohort_id:UUID}`,
        query_params: { cohort_id: cohortId },
      }).catch((err: unknown) => {
        this.logger.warn({ err, cohortId }, 'Failed to clean up person_static_cohort');
      });
    }
  }

  async getMemberCount(projectId: string, cohortId: string): Promise<number> {
    const cohort = await this.getById(projectId, cohortId);
    if (cohort.is_static) {
      return countStaticCohortMembers(this.ch, projectId, cohortId);
    }
    if (cohort.membership_version !== null) {
      return countCohortMembersFromTable(this.ch, projectId, cohortId);
    }
    return countCohortMembers(this.ch, projectId, cohort.definition);
  }

  async previewCount(
    projectId: string,
    definition: CohortConditionGroup | undefined,
  ): Promise<number> {
    if (!definition) return 0;
    return countCohortMembers(this.ch, projectId, definition);
  }

  async getSizeHistory(
    projectId: string,
    cohortId: string,
    days: number = 30,
  ) {
    await this.getById(projectId, cohortId);
    return queryCohortSizeHistory(this.ch, projectId, cohortId, days);
  }

  // ── Cohort resolution for analytics queries ────────────────────────────────

  async resolveCohortFilters(
    projectId: string,
    cohortIds: string[],
  ): Promise<CohortFilterInput[]> {
    const rows = await this.getByIds(projectId, cohortIds);
    return rows.map((c) => ({
      cohort_id: c.id,
      definition: c.definition,
      materialized: c.membership_version !== null,
      is_static: c.is_static,
    }));
  }

  async resolveCohortBreakdowns(
    projectId: string,
    cohortIds: string[],
  ): Promise<CohortBreakdownEntry[]> {
    const rows = await this.getByIds(projectId, cohortIds);
    return rows.map((c) => ({
      cohort_id: c.id,
      name: c.name,
      is_static: c.is_static,
      materialized: c.membership_version !== null,
      definition: c.definition,
    }));
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async getByIds(projectId: string, cohortIds: string[]) {
    const rows = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), inArray(cohorts.id, cohortIds)));

    if (rows.length !== cohortIds.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = cohortIds.find((id) => !found.has(id));
      throw new CohortNotFoundException(`Cohort ${missing} not found`);
    }

    return rows;
  }

  private async checkCircularDependency(
    cohortId: string,
    definition: CohortConditionGroup,
    projectId: string,
  ) {
    const isCircular = await detectCircularDependency(
      cohortId,
      definition,
      async (refId: string) => {
        try {
          const refCohort = await this.getById(projectId, refId);
          return refCohort.definition;
        } catch (err) {
          if (err instanceof CohortNotFoundException) return null;
          throw err;
        }
      },
    );

    if (isCircular) {
      throw new AppBadRequestException('Circular cohort reference detected');
    }
  }
}
