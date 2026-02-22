import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { cohorts, type CohortDefinition, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { CohortNotFoundException } from './exceptions/cohort-not-found.exception';
import { countCohortMembers, countCohortMembersFromTable } from './cohorts.query';

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
    input: { name: string; description?: string; definition: CohortDefinition },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .insert(cohorts)
      .values({
        project_id: projectId,
        created_by: userId,
        name: input.name,
        description: input.description ?? null,
        definition: input.definition,
      })
      .returning();

    return rows[0];
  }

  async update(
    userId: string,
    projectId: string,
    cohortId: string,
    input: { name?: string; description?: string; definition?: CohortDefinition },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (existing.length === 0) throw new CohortNotFoundException();

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.definition !== undefined) {
      updateData.definition = input.definition;
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
    }).catch((err) => {
      this.logger.warn({ err, cohortId }, 'Failed to clean up cohort_members');
    });
  }

  async getMemberCount(userId: string, projectId: string, cohortId: string): Promise<number> {
    const cohort = await this.getById(userId, projectId, cohortId);
    if (cohort.membership_version !== null) {
      return countCohortMembersFromTable(this.ch, projectId, cohortId);
    }
    return countCohortMembers(this.ch, projectId, cohort.definition);
  }

  async previewCount(userId: string, projectId: string, definition: CohortDefinition): Promise<number> {
    await this.projectsService.getMembership(userId, projectId);
    return countCohortMembers(this.ch, projectId, definition);
  }

  async getCohortDefinition(userId: string, projectId: string, cohortId: string): Promise<CohortDefinition> {
    const cohort = await this.getById(userId, projectId, cohortId);
    return cohort.definition;
  }
}
