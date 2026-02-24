import { Injectable, Inject } from '@nestjs/common';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { cohorts, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { CohortsService } from './cohorts.service';

@Injectable()
export class StaticCohortsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly cohortsService: CohortsService,
    private readonly projectsService: ProjectsService,
  ) {}

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
    const source = await this.cohortsService.getById(userId, projectId, cohortId);

    // Get current members
    const memberCount = await this.cohortsService.getMemberCount(userId, projectId, cohortId);
    if (memberCount === 0) {
      throw new AppBadRequestException('Source cohort has no members');
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
        SELECT project_id, {new_cohort_id:UUID} AS cohort_id, person_id
        FROM ${sourceTable} FINAL
        WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
      query_params: { new_cohort_id: newCohort.id, project_id: projectId, cohort_id: cohortId },
    });

    return newCohort;
  }

  async addStaticMembers(userId: string, projectId: string, cohortId: string, personIds: string[]) {
    const cohort = await this.cohortsService.getById(userId, projectId, cohortId);
    if (!cohort.is_static) {
      throw new AppBadRequestException('Cannot add members to a dynamic cohort');
    }
    await this.insertStaticMembers(projectId, cohortId, personIds);
  }

  async removeStaticMembers(userId: string, projectId: string, cohortId: string, personIds: string[]) {
    const cohort = await this.cohortsService.getById(userId, projectId, cohortId);
    if (!cohort.is_static) {
      throw new AppBadRequestException('Cannot remove members from a dynamic cohort');
    }

    await this.ch.command({
      query: `ALTER TABLE person_static_cohort DELETE
              WHERE project_id = {project_id:UUID}
                AND cohort_id = {cohort_id:UUID}
                AND person_id IN {person_ids:Array(UUID)}`,
      query_params: { project_id: projectId, cohort_id: cohortId, person_ids: personIds },
    });
  }

  async importStaticCohortCsv(
    userId: string,
    projectId: string,
    cohortId: string,
    csvContent: string,
  ) {
    const cohort = await this.cohortsService.getById(userId, projectId, cohortId);
    if (!cohort.is_static) {
      throw new AppBadRequestException('Cannot import CSV to a dynamic cohort');
    }

    // Parse CSV — expect one ID per line (or comma-separated)
    const lines = csvContent.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      throw new AppBadRequestException('CSV file is empty');
    }

    // Detect column type from header
    let idType: 'distinct_id' | 'email' = 'distinct_id';
    let start = 0;

    if (/^(distinct_id|id|person_id|user_id)$/i.test(lines[0])) {
      idType = 'distinct_id';
      start = 1;
    } else if (/^(email|e-mail)$/i.test(lines[0])) {
      idType = 'email';
      start = 1;
    }

    const ids = lines.slice(start);

    if (ids.length === 0) {
      throw new AppBadRequestException('No valid IDs found in CSV');
    }

    let personIds: string[];

    if (idType === 'email') {
      personIds = await this.resolveEmailsToPersonIds(projectId, ids);
    } else {
      personIds = await this.resolveDistinctIdsToPersonIds(projectId, ids);
    }

    if (personIds.length > 0) {
      await this.insertStaticMembers(projectId, cohortId, personIds);
    }

    return { imported: personIds.length, total_lines: ids.length };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async resolveDistinctIdsToPersonIds(projectId: string, distinctIds: string[]): Promise<string[]> {
    const result = await this.ch.query({
      query: `
        SELECT DISTINCT
          coalesce(
            dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)),
            person_id
          ) AS resolved_person_id
        FROM events FINAL
        WHERE project_id = {project_id:UUID}
          AND distinct_id IN {ids:Array(String)}`,
      query_params: { project_id: projectId, ids: distinctIds },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();
    return rows.map((r) => r.resolved_person_id);
  }

  private async resolveEmailsToPersonIds(projectId: string, emails: string[]): Promise<string[]> {
    // Resolve via ClickHouse events — latest user_properties email
    const result = await this.ch.query({
      query: `
        SELECT DISTINCT person_id AS resolved_person_id
        FROM events FINAL
        WHERE project_id = {project_id:UUID}
          AND JSONExtractString(user_properties, 'email') IN {emails:Array(String)}`,
      query_params: { project_id: projectId, emails },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();
    return rows.map((r) => r.resolved_person_id);
  }

  private async insertStaticMembers(projectId: string, cohortId: string, personIds: string[]) {
    await this.ch.insert({
      table: 'person_static_cohort',
      values: personIds.map((pid) => ({
        project_id: projectId,
        cohort_id: cohortId,
        person_id: pid,
      })),
      format: 'JSONEachRow',
    });
  }
}
