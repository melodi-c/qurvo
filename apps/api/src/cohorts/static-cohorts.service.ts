import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import { cohorts, type Database } from '@qurvo/db';
import { resolvedPerson, resolvePropertyExpr } from '../analytics/query-helpers';
import { select, col, eq as chEq, param, lower, inArray } from '@qurvo/ch-query';
import { CohortsService } from './cohorts.service';
import { parseCohortCsv } from './parse-cohort-csv';

@Injectable()
export class StaticCohortsService {
  private readonly logger = new Logger(StaticCohortsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly cohortsService: CohortsService,
  ) {}

  async createStaticCohort(
    userId: string,
    projectId: string,
    input: { name: string; description?: string; person_ids?: string[] },
  ) {
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
    const source = await this.cohortsService.getById(projectId, cohortId);

    // Dynamic cohorts must be materialized before duplication; without a
    // computed membership the INSERT…SELECT would silently copy zero rows and
    // produce a misleading empty static cohort.
    if (!source.is_static && source.membership_version === null) {
      throw new AppBadRequestException('Cohort has not been computed yet');
    }

    // Create static cohort in PostgreSQL first, then copy members to ClickHouse.
    // If the CH INSERT fails, we must roll back the PG record to prevent a
    // "ghost" cohort (PG row exists but CH has no members).
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

    try {
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
    } catch (chError) {
      // Compensating delete: remove the PG record so no ghost cohort remains.
      this.logger.error(
        { err: chError, cohortId: newCohort.id },
        'ClickHouse INSERT failed during duplicateAsStatic — rolling back PG record',
      );
      try {
        await this.db
          .delete(cohorts)
          .where(and(eq(cohorts.id, newCohort.id), eq(cohorts.project_id, projectId)));
      } catch (deleteError) {
        this.logger.error(
          { err: deleteError, cohortId: newCohort.id },
          'Failed to roll back PG cohort record after ClickHouse error',
        );
      }
      throw chError;
    }

    return newCohort;
  }

  async addStaticMembers(projectId: string, cohortId: string, personIds: string[]) {
    const cohort = await this.cohortsService.getById(projectId, cohortId);
    if (!cohort.is_static) {
      throw new AppBadRequestException('Cannot add members to a dynamic cohort');
    }
    await this.insertStaticMembers(projectId, cohortId, personIds);
  }

  async removeStaticMembers(projectId: string, cohortId: string, personIds: string[]) {
    const cohort = await this.cohortsService.getById(projectId, cohortId);
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
    projectId: string,
    cohortId: string,
    csvContent: string,
  ) {
    const cohort = await this.cohortsService.getById(projectId, cohortId);
    if (!cohort.is_static) {
      throw new AppBadRequestException('Cannot import CSV to a dynamic cohort');
    }

    const { idType, ids } = parseCohortCsv(csvContent);

    if (ids.length === 0) {
      throw new AppBadRequestException('CSV file is empty or contains no valid IDs');
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

  async getStaticMembers(
    projectId: string,
    cohortId: string,
    limit: number,
    offset: number,
  ): Promise<{ data: { person_id: string; user_properties: Record<string, unknown> }[]; total: number }> {
    const cohort = await this.cohortsService.getById(projectId, cohortId);
    if (!cohort.is_static) {
      throw new AppBadRequestException('Cannot list members of a dynamic cohort');
    }

    // Count total members in this static cohort
    const countResult = await this.ch.query({
      query: `
        SELECT count() AS total
        FROM person_static_cohort FINAL
        WHERE project_id = {project_id:UUID}
          AND cohort_id = {cohort_id:UUID}`,
      query_params: { project_id: projectId, cohort_id: cohortId },
      format: 'JSONEachRow',
    });
    const countRows = await countResult.json<{ total: string }>();
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    // Fetch paginated member details — join against events to get latest user_properties
    const dataResult = await this.ch.query({
      query: `
        SELECT
          toString(e.person_id) AS person_id,
          argMax(e.user_properties, e.timestamp) AS user_properties
        FROM events AS e
        WHERE e.project_id = {project_id:UUID}
          AND e.person_id IN (
            SELECT person_id
            FROM person_static_cohort FINAL
            WHERE project_id = {project_id:UUID}
              AND cohort_id = {cohort_id:UUID}
            LIMIT {limit:UInt32} OFFSET {offset:UInt32}
          )
        GROUP BY e.person_id
        LIMIT {limit:UInt32}`,
      query_params: { project_id: projectId, cohort_id: cohortId, limit, offset },
      format: 'JSONEachRow',
    });
    const rows = await dataResult.json<{ person_id: string; user_properties: string | Record<string, unknown> }>();

    const data = rows.map((r) => ({
      person_id: r.person_id,
      user_properties: typeof r.user_properties === 'string'
        ? (JSON.parse(r.user_properties) as Record<string, unknown>)
        : (r.user_properties),
    }));

    return { data, total };
  }

  // Private helpers

  private async resolveDistinctIdsToPersonIds(projectId: string, distinctIds: string[]): Promise<string[]> {
    const result = await this.ch.query({
      query: `
        SELECT DISTINCT
          coalesce(
            dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)),
            person_id
          ) AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND distinct_id IN {ids:Array(String)}`,
      query_params: { project_id: projectId, ids: distinctIds },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();
    return rows.map((r) => r.resolved_person_id);
  }

  private async resolveEmailsToPersonIds(projectId: string, emails: string[]): Promise<string[]> {
    // Normalise emails to lowercase — ClickHouse string comparison is case-sensitive,
    // and CSV files from external systems often have different casing.
    const normalizedEmails = emails.map((e) => e.toLowerCase());

    // Resolve via ClickHouse events — latest user_properties email
    const node = select(resolvedPerson().as('resolved_person_id'))
      .distinct()
      .from('events')
      .where(
        chEq(col('project_id'), param('UUID', projectId)),
        inArray(lower(resolvePropertyExpr('user_properties.email')), param('Array(String)', normalizedEmails)),
      )
      .build();

    const rows = await new ChQueryExecutor(this.ch).rows<{ resolved_person_id: string }>(node);
    return rows.map((r) => r.resolved_person_id);
  }

  private async insertStaticMembers(projectId: string, cohortId: string, personIds: string[]) {
    // Insert in chunks of 5 000 to avoid memory spikes and ClickHouse query-size limits
    // when importing large CSV files (up to ~135 k rows).
    const CHUNK_SIZE = 5_000;
    for (let i = 0; i < personIds.length; i += CHUNK_SIZE) {
      const chunk = personIds.slice(i, i + CHUNK_SIZE);
      await this.ch.insert({
        table: 'person_static_cohort',
        values: chunk.map((pid) => ({
          project_id: projectId,
          cohort_id: cohortId,
          person_id: pid,
        })),
        format: 'JSONEachRow',
      });
    }
  }
}
