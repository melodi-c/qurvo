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

  // ── Static cohort operations ─────────────────────────────────────────────

  async createStaticCohort(
    userId: string,
    projectId: string,
    input: { name: string; description?: string; person_ids?: string[] },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .insert(cohorts)
      .values({
        project_id: projectId,
        created_by: userId,
        name: input.name,
        description: input.description ?? null,
        definition: { type: 'AND', values: [] },
        is_static: true,
      })
      .returning();

    const cohort = rows[0];

    if (input.person_ids && input.person_ids.length > 0) {
      await this.insertStaticMembers(projectId, cohort.id, input.person_ids);
    }

    return cohort;
  }

  async duplicateAsStatic(userId: string, projectId: string, cohortId: string) {
    const source = await this.getById(userId, projectId, cohortId);

    // Get current members
    const memberCount = await this.getMemberCount(userId, projectId, cohortId);
    if (memberCount === 0) {
      throw new BadRequestException('Source cohort has no members');
    }

    // Create static cohort
    const rows = await this.db
      .insert(cohorts)
      .values({
        project_id: projectId,
        created_by: userId,
        name: `${source.name} (static copy)`,
        description: source.description,
        definition: { type: 'AND', values: [] },
        is_static: true,
      })
      .returning();

    const newCohort = rows[0];

    // Copy members from source cohort into static table
    const sourceTable = source.is_static ? 'person_static_cohort' : 'cohort_members';
    await this.ch.command({
      query: `
        INSERT INTO person_static_cohort (project_id, cohort_id, person_id)
        SELECT project_id, '${newCohort.id}' AS cohort_id, person_id
        FROM ${sourceTable} FINAL
        WHERE project_id = '${projectId}' AND cohort_id = '${cohortId}'`,
    });

    return newCohort;
  }

  async addStaticMembers(userId: string, projectId: string, cohortId: string, personIds: string[]) {
    const cohort = await this.getById(userId, projectId, cohortId);
    if (!cohort.is_static) {
      throw new BadRequestException('Cannot add members to a dynamic cohort');
    }
    await this.insertStaticMembers(projectId, cohortId, personIds);
  }

  async removeStaticMembers(userId: string, projectId: string, cohortId: string, personIds: string[]) {
    const cohort = await this.getById(userId, projectId, cohortId);
    if (!cohort.is_static) {
      throw new BadRequestException('Cannot remove members from a dynamic cohort');
    }

    const idList = personIds.map((id) => `'${id}'`).join(',');
    await this.ch.command({
      query: `ALTER TABLE person_static_cohort DELETE
              WHERE project_id = '${projectId}'
                AND cohort_id = '${cohortId}'
                AND person_id IN (${idList})`,
    });
  }

  async importStaticCohortCsv(
    userId: string,
    projectId: string,
    cohortId: string,
    csvContent: string,
  ) {
    const cohort = await this.getById(userId, projectId, cohortId);
    if (!cohort.is_static) {
      throw new BadRequestException('Cannot import CSV to a dynamic cohort');
    }

    // Parse CSV — expect distinct_id per line (or comma-separated)
    const lines = csvContent.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    // Skip header row if it looks like one
    const start = /^(distinct_id|id|person_id|user_id)$/i.test(lines[0]) ? 1 : 0;
    const distinctIds = lines.slice(start);

    if (distinctIds.length === 0) {
      throw new BadRequestException('No valid IDs found in CSV');
    }

    // Resolve distinct_ids to person_ids via ClickHouse
    const idList = distinctIds.map((id) => `'${id}'`).join(',');
    const result = await this.ch.query({
      query: `
        SELECT DISTINCT
          coalesce(
            dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)),
            person_id
          ) AS resolved_person_id
        FROM events FINAL
        WHERE project_id = {project_id:UUID}
          AND distinct_id IN (${idList})`,
      query_params: { project_id: projectId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();
    const personIds = rows.map((r: { resolved_person_id: string }) => r.resolved_person_id);

    if (personIds.length > 0) {
      await this.insertStaticMembers(projectId, cohortId, personIds);
    }

    return { imported: personIds.length, total_lines: distinctIds.length };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async insertStaticMembers(projectId: string, cohortId: string, personIds: string[]) {
    const values = personIds.map((pid) =>
      `('${projectId}', '${cohortId}', '${pid}')`
    ).join(',');

    await this.ch.command({
      query: `INSERT INTO person_static_cohort (project_id, cohort_id, person_id) VALUES ${values}`,
    });
  }

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
