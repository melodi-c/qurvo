import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortConditionGroup } from '@qurvo/db';
import { CohortsService } from '../../cohorts/cohorts.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { buildCohortSubquery } from '@qurvo/cohort-query';
import { compile } from '@qurvo/ch-query';

const argsSchema = z.object({
  cohort_id: z.string().uuid().describe('UUID of the cohort to query'),
  limit: z.number().int().min(1).max(100).nullish().describe('Max number of members to return when include_members is true (default 20, max 100)'),
  include_members: z.boolean().nullish().describe('Whether to include the member list with person details (default false — returns count only)'),
});

const tool = defineTool({
  name: 'query_cohort_members',
  description:
    'Query cohort size and optionally list its members. Returns cohort metadata (name, type, member count). ' +
    'Set include_members=true to also fetch a sample of member details (person_id and latest user properties). ' +
    'Use this to answer questions like "how many people are in cohort X?" or "show me the power users cohort".',
  schema: argsSchema,
});

interface MemberRow {
  person_id: string;
  user_properties: Record<string, unknown>;
}

@Injectable()
export class QueryCohortMembersTool implements AiTool {
  readonly name = tool.name;

  constructor(
    private readonly cohortsService: CohortsService,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const limit = args.limit ?? 20;

    const cohort = await this.cohortsService.getById(projectId, args.cohort_id);
    const member_count = await this.cohortsService.getMemberCount(projectId, args.cohort_id);

    const result: {
      cohort_id: string;
      name: string;
      description: string | null;
      type: 'static' | 'dynamic';
      member_count: number;
      members?: MemberRow[];
    } = {
      cohort_id: cohort.id,
      name: cohort.name,
      description: cohort.description,
      type: cohort.is_static ? 'static' : 'dynamic',
      member_count,
    };

    if (args.include_members) {
      result.members = await this.queryMemberDetails(
        projectId,
        cohort.id,
        cohort.is_static,
        cohort.membership_version !== null,
        cohort.definition,
        limit,
      );
    }

    return result;
  });

  private async queryMemberDetails(
    projectId: string,
    cohortId: string,
    isStatic: boolean,
    isMaterialized: boolean,
    definition: CohortConditionGroup,
    limit: number,
  ): Promise<MemberRow[]> {
    // Build the subquery that yields person_id rows for this cohort
    let personIdSubquery: string;
    const params: Record<string, unknown> = { project_id: projectId, cohort_id: cohortId, limit };

    if (isStatic) {
      personIdSubquery = `
        SELECT person_id
        FROM person_static_cohort FINAL
        WHERE project_id = {project_id:UUID}
          AND cohort_id = {cohort_id:UUID}
        LIMIT {limit:UInt32}`;
    } else if (isMaterialized) {
      personIdSubquery = `
        SELECT person_id
        FROM cohort_members FINAL
        WHERE project_id = {project_id:UUID}
          AND cohort_id = {cohort_id:UUID}
        LIMIT {limit:UInt32}`;
    } else {
      // Inline cohort definition — build dynamic subquery
      const innerParams: Record<string, unknown> = { project_id: projectId };
      const node = buildCohortSubquery(definition, 0, 'project_id', innerParams);
      const { sql: definitionSubquery, params: compiledParams } = compile(node);
      // Merge inner params (may add numbered params like p0, p1, ...) into outer params
      Object.assign(params, innerParams, compiledParams);
      personIdSubquery = `
        SELECT person_id
        FROM (${definitionSubquery})
        LIMIT {limit:UInt32}`;
    }

    // Join against the events table to get latest user_properties per person
    const sql = `
      SELECT
        toString(e.person_id) AS person_id,
        argMax(e.user_properties, e.timestamp) AS user_properties
      FROM events AS e
      WHERE e.project_id = {project_id:UUID}
        AND e.person_id IN (${personIdSubquery})
      GROUP BY e.person_id
      LIMIT {limit:UInt32}`;

    const res = await this.ch.query({ query: sql, query_params: params, format: 'JSONEachRow' });
    const rows = await res.json<{ person_id: string; user_properties: string }>();

    return rows.map((r) => ({
      person_id: r.person_id,
      user_properties: typeof r.user_properties === 'string'
        ? (JSON.parse(r.user_properties) as Record<string, unknown>)
        // eslint-disable-next-line no-restricted-syntax -- ClickHouse returns user_properties as either string or parsed object
        : (r.user_properties as unknown as Record<string, unknown>),
    }));
  }
}
