import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery, buildCohortMemberSubquery } from '@qurvo/cohort-query';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  col,
  namedParam,
  eq,
  gte,
  sub as chSub,
  today,
  uniqExact,
  toString as chToString,
} from '@qurvo/ch-query';

export interface CohortHistoryPoint {
  date: string;
  count: number;
}

/**
 * Counts the number of unique persons matching a cohort definition (inline).
 *
 * @param resolveCohortIsStatic - Optional callback that returns whether a
 *   referenced cohort ID is static. Used when the definition contains nested
 *   `{ type: 'cohort', cohort_id }` conditions and the `is_static` flag has
 *   not already been enriched on those conditions by the service layer.
 */
export async function countCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  definition: CohortConditionGroup,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): Promise<number> {
  const params: Record<string, unknown> = { project_id: projectId };
  const node = buildCohortSubquery(definition, 0, 'project_id', params, resolveCohortIsStatic);
  const wrapper = select(uniqExact(col('person_id')).as('cnt')).from(node).build();
  return new ChQueryExecutor(ch).count(wrapper);
}

/**
 * Counts unique persons from pre-computed cohort_members table.
 */
export async function countCohortMembersFromTable(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<number> {
  const node = select(uniqExact(col('person_id')).as('cnt'))
    .from('cohort_members').final()
    .where(
      eq(col('project_id'), namedParam('project_id', 'UUID', projectId)),
      eq(col('cohort_id'), namedParam('cohort_id', 'UUID', cohortId)),
    )
    .build();
  return new ChQueryExecutor(ch).count(node);
}

/**
 * Counts unique persons from person_static_cohort table.
 */
export async function countStaticCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<number> {
  const node = select(uniqExact(col('person_id')).as('cnt'))
    .from('person_static_cohort').final()
    .where(
      eq(col('project_id'), namedParam('project_id', 'UUID', projectId)),
      eq(col('cohort_id'), namedParam('cohort_id', 'UUID', cohortId)),
    )
    .build();
  return new ChQueryExecutor(ch).count(node);
}

/**
 * Queries cohort size history from cohort_membership_history table.
 * Returns daily points sorted ascending by date.
 */
export async function queryCohortSizeHistory(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
  days: number,
): Promise<CohortHistoryPoint[]> {
  const node = select(
    chToString(col('date')).as('dt'),
    col('count'),
  )
    .from('cohort_membership_history').final()
    .where(
      eq(col('project_id'), namedParam('project_id', 'UUID', projectId)),
      eq(col('cohort_id'), namedParam('cohort_id', 'UUID', cohortId)),
      gte(col('date'), chSub(today(), namedParam('days', 'UInt32', days))),
    )
    .orderBy(col('date'), 'ASC')
    .build();

  const rows = await new ChQueryExecutor(ch).rows<{ dt: string; count: string }>(node);
  return rows.map((r) => ({ date: r.dt, count: Number(r.count) }));
}

/**
 * Counts unique persons matching any cohort type (static, materialized, or inline).
 *
 * Uses `buildCohortMemberSubquery` as the single routing source-of-truth.
 * This is the preferred function for counting cohort members — callers do not
 * need to know which storage backend the cohort uses.
 */
export async function countCohortMembersUnified(
  ch: ClickHouseClient,
  projectId: string,
  input: CohortFilterInput,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): Promise<number> {
  const params: Record<string, unknown> = { project_id: projectId };
  const node = buildCohortMemberSubquery(
    input, 'cohort_id', 'project_id', params, 0,
    resolveCohortIsStatic,
  );
  const wrapper = select(uniqExact(col('person_id')).as('cnt')).from(node).build();
  return new ChQueryExecutor(ch).count(wrapper);
}
