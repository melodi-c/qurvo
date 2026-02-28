import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  compile,
  select,
  col,
  raw,
  countIf,
  avgIf,
  and,
  gte,
  gt,
  literal,
  notInSubquery,
  type Expr,
} from '@qurvo/ch-query';
import type {
  FunnelQueryParams,
  FunnelBreakdownStepResult,
  FunnelStepResult,
} from './funnel.types';
import { buildOrderedFunnelCTEs } from './funnel-ordered.sql';
import { buildUnorderedFunnelCTEs } from './funnel-unordered.sql';
import {
  computeCohortBreakdownStepResults,
  computeStepResults,
  type RawFunnelRow,
} from './funnel-results';
import { buildCohortFilterForBreakdown } from '../../cohorts/cohort-breakdown.util';
import { toChTs, type FunnelChQueryParams } from './funnel-sql-shared';

interface CohortBreakdownResult {
  steps: FunnelBreakdownStepResult[];
  aggregate_steps: FunnelStepResult[];
}

/**
 * Builds a compiled cohort funnel query from CTEs.
 * Shared between per-cohort and aggregate paths.
 */
function buildCohortFunnelCompiled(
  cteResult: { ctes: Array<{ name: string; query: import('@qurvo/ch-query').QueryNode }>; hasExclusions: boolean },
): { sql: string; params: Record<string, unknown> } {
  const stepsSubquery = select(raw('number + 1').as('step_num'))
    .from('numbers({num_steps:UInt64})')
    .build();

  const whereConditions: Expr[] = [];
  if (cteResult.hasExclusions) {
    const excludedRef = select(col('person_id')).from('excluded_users').build();
    whereConditions.push(notInSubquery(col('person_id'), excludedRef));
  }

  const builder = select(
    col('step_num'),
    countIf(gte(col('max_step'), col('step_num'))).as('entered'),
    countIf(gte(col('max_step'), raw('step_num + 1'))).as('next_step'),
    avgIf(
      raw('(last_step_ms - first_step_ms) / 1000.0'),
      and(
        gte(col('max_step'), raw('{num_steps:UInt64}')),
        gt(raw('first_step_ms'), literal(0)),
        gt(col('last_step_ms'), raw('first_step_ms')),
      ),
    ).as('avg_time_seconds'),
  )
    .withAll(cteResult.ctes)
    .from('funnel_per_user')
    .crossJoin(stepsSubquery, 'steps');

  if (whereConditions.length > 0) {
    builder.where(...whereConditions);
  }

  builder
    .groupBy(col('step_num'))
    .orderBy(col('step_num'));

  return compile(builder.build());
}

/**
 * Runs one ClickHouse query per cohort sequentially and assembles the combined breakdown result.
 * Sequential execution (for...of) prevents exhausting the ClickHouse connection pool when many
 * cohorts are requested. Called by queryFunnel when params.breakdown_cohort_ids is set.
 */
export async function runFunnelCohortBreakdown(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
  baseQueryParams: FunnelChQueryParams,
  stepConditions: string,
  cohortClause: string,
  samplingClause: string,
): Promise<CohortBreakdownResult> {
  const cohortBreakdowns = params.breakdown_cohort_ids!;
  const { steps, exclusions = [] } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const numSteps = steps.length;

  const perCohortResults: Awaited<ReturnType<typeof computeCohortBreakdownStepResults>>[] = [];

  for (let cbIdx = 0; cbIdx < cohortBreakdowns.length; cbIdx++) {
    const cb = cohortBreakdowns[cbIdx];
    const cbParamKey = `cohort_bd_${cb.cohort_id.replace(/-/g, '')}`;
    const cbQueryParams = { ...baseQueryParams };

    const cohortFilterPredicate = buildCohortFilterForBreakdown(
      cb, cbParamKey, 900 + cbIdx, cbQueryParams, toChTs(params.date_to, true), toChTs(params.date_from),
    );
    const cohortFilter = ` AND ${cohortFilterPredicate}`;

    let cteResult;

    if (orderType === 'unordered') {
      cteResult = buildUnorderedFunnelCTEs({
        steps,
        exclusions,
        cohortClause: `${cohortClause}${cohortFilter}`,
        samplingClause,
        queryParams: cbQueryParams,
      });
    } else {
      cteResult = buildOrderedFunnelCTEs({
        steps,
        orderType,
        stepConditions,
        exclusions,
        cohortClause: `${cohortClause}${cohortFilter}`,
        samplingClause,
        numSteps,
        queryParams: cbQueryParams,
        includeTimestampCols: true,
      });
    }

    const compiled = buildCohortFunnelCompiled(cteResult);
    const result = await ch.query({ query: compiled.sql, query_params: { ...cbQueryParams, ...compiled.params }, format: 'JSONEachRow' });
    const rows = await result.json<RawFunnelRow>();
    perCohortResults.push(computeCohortBreakdownStepResults(rows, steps, numSteps, cb.cohort_id, cb.name));
  }

  const allBreakdownSteps = perCohortResults.flat();

  // Run a separate no-breakdown query for aggregate_steps.
  const aggregateQueryParams = { ...baseQueryParams };
  let aggregateCteResult;

  if (orderType === 'unordered') {
    aggregateCteResult = buildUnorderedFunnelCTEs({
      steps,
      exclusions,
      cohortClause,
      samplingClause,
      queryParams: aggregateQueryParams,
    });
  } else {
    aggregateCteResult = buildOrderedFunnelCTEs({
      steps,
      orderType,
      stepConditions,
      exclusions,
      cohortClause,
      samplingClause,
      numSteps,
      queryParams: aggregateQueryParams,
      includeTimestampCols: true,
    });
  }

  const aggregateCompiled = buildCohortFunnelCompiled(aggregateCteResult);
  const aggregateResult = await ch.query({
    query: aggregateCompiled.sql,
    query_params: { ...aggregateQueryParams, ...aggregateCompiled.params },
    format: 'JSONEachRow',
  });
  const aggregateRows = await aggregateResult.json<RawFunnelRow>();
  const aggregateSteps = computeStepResults(aggregateRows, steps, numSteps);

  return {
    steps: allBreakdownSteps,
    aggregate_steps: aggregateSteps,
  };
}
