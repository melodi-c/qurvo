import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  select,
  col,
  count,
  gte,
  literal,
  type Expr,
} from '@qurvo/ch-query';
import { cohortFilter, cohortBounds } from '../analytics/query-helpers';
import type { FunnelStep, FunnelOrderType } from '../analytics/funnel/funnel.types';
import { buildBaseQueryParams } from '../analytics/funnel/funnel-params';
import { buildStepCondition, buildAllEventNames } from '../analytics/funnel/funnel-steps';
import { buildFunnelCTEs } from '../analytics/funnel/funnel-cte-dispatch';
import type { CohortFilterInput } from '@qurvo/cohort-query';

export interface PersonsAtFunnelStepParams {
  project_id: string;
  steps: FunnelStep[];
  /** 1-based step number: which step the person must have reached */
  step: number;
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  timezone: string;
  limit: number;
  offset: number;
  cohort_filters?: CohortFilterInput[];
  funnel_order_type?: FunnelOrderType;
}

interface PersonIdRow {
  person_id: string;
}

interface CountRow {
  total: string;
}

/**
 * Queries ClickHouse for person_ids that reached a given funnel step.
 *
 * Reuses the funnel CTE machinery (`buildFunnelCTEs` / `buildBaseQueryParams`)
 * to construct the `funnel_per_user` CTE, then selects distinct person_ids
 * where `max_step >= step`.
 *
 * Returns { personIds, total } via two parallel CH queries.
 */
export async function queryPersonsAtFunnelStep(
  ch: ClickHouseClient,
  params: PersonsAtFunnelStepParams,
): Promise<{ personIds: string[]; total: number }> {
  const { steps, step, limit, offset } = params;
  const orderType = params.funnel_order_type ?? 'ordered';

  // No exclusions for person-at-step queries
  const exclusions: [] = [];

  const allEventNames = buildAllEventNames(steps, exclusions);
  const queryParams = buildBaseQueryParams(params, allEventNames);
  const stepConditions: Expr[] = steps.map((s, i) => buildStepCondition(s, i));

  const { dateTo, dateFrom } = cohortBounds(params);
  const cohortExpr = cohortFilter(params.cohort_filters, params.project_id, dateTo, dateFrom);

  // Build funnel CTEs
  const cteResult = buildFunnelCTEs(orderType, {
    steps,
    exclusions,
    cohortExpr,
    samplingExpr: undefined,
    queryParams,
    stepConditions,
    numSteps: steps.length,
    // No breakdown, no timestamp columns needed
    includeTimestampCols: false,
  });

  const stepLiteral = literal(step);

  // Query 1: person_ids with LIMIT/OFFSET
  const idsQuery = select(col('person_id'))
    .withAll(cteResult.ctes)
    .from('funnel_per_user')
    .where(gte(col('max_step'), stepLiteral))
    .orderBy(col('person_id'))
    .limit(limit)
    .offset(offset)
    .build();

  // Query 2: total count
  const countQuery = select(count().as('total'))
    .withAll(cteResult.ctes)
    .from('funnel_per_user')
    .where(gte(col('max_step'), stepLiteral))
    .build();

  const executor = new ChQueryExecutor(ch);
  const [idRows, countRows] = await Promise.all([
    executor.rows<PersonIdRow>(idsQuery),
    executor.rows<CountRow>(countQuery),
  ]);

  const personIds = idRows.map((r) => r.person_id);
  const total = countRows.length > 0 ? Number(countRows[0].total) : 0;

  return { personIds, total };
}
