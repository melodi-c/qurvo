import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  cohorts,
  type CohortConditionGroup, type Database,
} from '@qurvo/db';
import { detectCircularDependency } from '@qurvo/cohort-query';
import { ProjectsService } from '../projects/projects.service';
import { CohortNotFoundException } from './exceptions/cohort-not-found.exception';
import { countCohortMembers, countCohortMembersFromTable, countStaticCohortMembers } from './cohorts.query';

@Injectable()
export class CohortsService {
  private readonly logger = new Logger(CohortsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projectsService.getMembership(userId, projectId);

    return this.db
      .select()
      .from(cohorts)
      .where(eq(cohorts.project_id, projectId))
      .orderBy(cohorts.created_at);
  }

  async getById(userId: string, projectId: string, cohortId: string) {
    await this.projectsService.getMembership(userId, projectId);

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
    await this.projectsService.getMembership(userId, projectId);

    const definition = input.definition ?? null;
    if (!definition && !input.is_static) {
      throw new BadRequestException('definition is required for dynamic cohorts');
    }

    // Check circular dependency if definition references other cohorts
    if (definition) {
      await this.checkCircularDependency('', definition, userId, projectId);
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
    userId: string,
    projectId: string,
    cohortId: string,
    input: {
      name?: string;
      description?: string;
      definition?: CohortConditionGroup;
    },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (existing.length === 0) throw new CohortNotFoundException();

    const definition = input.definition;

    if (definition) {
      await this.checkCircularDependency(cohortId, definition, userId, projectId);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (definition !== undefined) {
      updateData.definition = definition;
      // Reset materialized membership — force fallback until recomputation
      updateData.membership_version = null;
      updateData.membership_computed_at = null;
    }

    const rows = await this.db
      .update(cohorts)
      .set(updateData)
      .where(eq(cohorts.id, cohortId))
      .returning();

    return rows[0];
  }

  async remove(userId: string, projectId: string, cohortId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (existing.length === 0) throw new CohortNotFoundException();

    await this.db.delete(cohorts).where(eq(cohorts.id, cohortId));

    // Fire-and-forget: clean up materialized membership rows
    this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id = '${cohortId}'`,
    }).catch((err: unknown) => {
      this.logger.warn({ err, cohortId }, 'Failed to clean up cohort_members');
    });

    // Also clean up static cohort rows if applicable
    if (existing[0].is_static) {
      this.ch.command({
        query: `ALTER TABLE person_static_cohort DELETE WHERE cohort_id = '${cohortId}'`,
      }).catch((err: unknown) => {
        this.logger.warn({ err, cohortId }, 'Failed to clean up person_static_cohort');
      });
    }
  }

  async getMemberCount(userId: string, projectId: string, cohortId: string): Promise<number> {
    const cohort = await this.getById(userId, projectId, cohortId);
    if (cohort.is_static) {
      return countStaticCohortMembers(this.ch, projectId, cohortId);
    }
    if (cohort.membership_version !== null) {
      return countCohortMembersFromTable(this.ch, projectId, cohortId);
    }
    return countCohortMembers(this.ch, projectId, cohort.definition);
  }

  async previewCount(
    userId: string,
    projectId: string,
    definition: CohortConditionGroup,
  ): Promise<number> {
    await this.projectsService.getMembership(userId, projectId);
    return countCohortMembers(this.ch, projectId, definition);
  }

  async getCohortDefinition(
    userId: string,
    projectId: string,
    cohortId: string,
  ): Promise<CohortConditionGroup> {
    const cohort = await this.getById(userId, projectId, cohortId);
    return cohort.definition;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async checkCircularDependency(
    cohortId: string,
    definition: CohortConditionGroup,
    userId: string,
    projectId: string,
  ) {
    const isCircular = await detectCircularDependency(
      cohortId,
      definition,
      async (refId: string) => {
        try {
          const refCohort = await this.getById(userId, projectId, refId);
          return refCohort.definition;
        } catch {
          return null;
        }
      },
    );

    if (isCircular) {
      throw new BadRequestException('Circular cohort reference detected');
    }
  }
}
