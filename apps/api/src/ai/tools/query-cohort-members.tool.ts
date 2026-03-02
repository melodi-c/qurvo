import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortConditionGroup } from '@qurvo/db';
import { CohortsService } from '../../cohorts/cohorts.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { buildCohortSubquery } from '@qurvo/cohort-query';
import type { QueryNode } from '@qurvo/ch-query';
import {
  select,
  col,
  namedParam,
  eq,
  inSubquery,
  argMax,
  toString as chToString,
} from '@qurvo/ch-query';

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
    const projectIdParam = namedParam('project_id', 'UUID', projectId);
    const cohortIdParam = namedParam('cohort_id', 'UUID', cohortId);

    // Build the subquery that yields person_id rows for this cohort
    let personIdNode: QueryNode;

    if (isStatic) {
      personIdNode = select(col('person_id'))
        .from('person_static_cohort').final()
        .where(eq(col('project_id'), projectIdParam), eq(col('cohort_id'), cohortIdParam))
        .limit(limit)
        .build();
    } else if (isMaterialized) {
      personIdNode = select(col('person_id'))
        .from('cohort_members').final()
        .where(eq(col('project_id'), projectIdParam), eq(col('cohort_id'), cohortIdParam))
        .limit(limit)
        .build();
    } else {
      // Inline cohort definition — build dynamic subquery
      const innerNode = buildCohortSubquery(definition, 0, 'project_id', projectId);
      personIdNode = select(col('person_id')).from(innerNode).limit(limit).build();
    }

    // Build outer query: latest user_properties per person from events
    const node = select(
      chToString(col('e.person_id')).as('person_id'),
      argMax(col('e.user_properties'), col('e.timestamp')).as('user_properties'),
    )
      .from('events', 'e')
      .where(
        eq(col('e.project_id'), projectIdParam),
        inSubquery(col('e.person_id'), personIdNode),
      )
      .groupBy(col('e.person_id'))
      .limit(limit)
      .build();

    const rows = await new ChQueryExecutor(this.ch).rows<{ person_id: string; user_properties: string }>(node);

    return rows.map((r) => ({
      person_id: r.person_id,
      user_properties: typeof r.user_properties === 'string'
        ? (JSON.parse(r.user_properties) as Record<string, unknown>)
        // eslint-disable-next-line no-restricted-syntax -- ClickHouse returns user_properties as either string or parsed object
        : (r.user_properties as unknown as Record<string, unknown>),
    }));
  }
}
