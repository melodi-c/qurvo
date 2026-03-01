import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  compile,
  select,
  col,
  count,
  countIf,
  and,
  gte,
  or,
  inSubquery,
  eq,
  neq,
  literal,
  subquery,
  add,
  type Expr,
  type SelectNode,
  type CompiledQuery,
  type QueryNode,
} from '@qurvo/ch-query';
import { resolvePropertyExpr, cohortFilter, cohortBounds } from '../query-helpers';
import { MAX_BREAKDOWN_VALUES } from '../../constants';
import type { FunnelQueryParams, FunnelQueryResult } from './funnel.types';
import {
  buildAllEventNames,
  buildBaseQueryParams,
  buildSamplingClause,
  buildStepCondition,
  avgTimeSecondsExpr,
  stepsSubquery as buildStepsSubquery,
  validateExclusions,
  validateUnorderedSteps,
  notInExcludedUsers,
  type FunnelChQueryParams,
} from './funnel-sql-shared';
import { buildOrderedFunnelCTEs } from './funnel-ordered.sql';
import { buildUnorderedFunnelCTEs } from './funnel-unordered.sql';
import { runFunnelCohortBreakdown } from './funnel-cohort-breakdown';
import {
  computeStepResults,
  computePropertyBreakdownResults,
  type RawFunnelRow,
  type RawBreakdownRow,
} from './funnel-results';

// Re-export public API for consumers (funnel.service.ts, integration tests, etc.)
export * from './funnel.types';
export { queryFunnelTimeToConvert } from './funnel-time-to-convert';

// ── Main funnel query ────────────────────────────────────────────────────────

export async function queryFunnel(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
): Promise<FunnelQueryResult> {
  const { steps, exclusions = [] } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const numSteps = steps.length;

  validateExclusions(exclusions, numSteps, steps);

  if (orderType === 'unordered') {
    validateUnorderedSteps(steps);
  }

  const allEventNames = buildAllEventNames(steps, exclusions);
  const queryParams = buildBaseQueryParams(params, allEventNames);
  // Build step conditions as Expr AST nodes
  const stepConditions: Expr[] = steps.map((s, i) => buildStepCondition(s, i));

  const { dateTo, dateFrom } = cohortBounds(params);
  const cohortExpr = cohortFilter(params.cohort_filters, params.project_id, dateTo, dateFrom);
  // Sampling clause as Expr AST
  const samplingExpr = buildSamplingClause(params.sampling_factor, queryParams);
  // Mirror the same guard used in buildSamplingClause: sampling is active only when
  // sampling_factor is a valid number < 1 (not null, not NaN, not >= 1).
  const sf = params.sampling_factor;
  const samplingResult = sf !== null && sf !== undefined && !isNaN(sf) && sf < 1
    ? { sampling_factor: sf } : {};

  // ── Cohort breakdown ────────────────────────────────────────────────────
  if (params.breakdown_cohort_ids?.length) {
    const { steps: bdSteps, aggregate_steps } = await runFunnelCohortBreakdown(
      ch, params, queryParams, stepConditions, cohortExpr, samplingExpr,
    );
    return {
      breakdown: true,
      breakdown_property: '$cohort',
      steps: bdSteps,
      aggregate_steps,
      ...samplingResult,
    };
  }

  // ── Non-breakdown funnel ────────────────────────────────────────────────
  if (!params.breakdown_property) {
    const compiled = buildFunnelQuery(orderType, steps, exclusions, stepConditions, cohortExpr, samplingExpr, numSteps, queryParams, undefined);
    const result = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
    const rows = await result.json<RawFunnelRow>();
    return { breakdown: false, steps: computeStepResults(rows, steps, numSteps), ...samplingResult };
  }

  // ── Property breakdown funnel ───────────────────────────────────────────
  const breakdownLimit = params.breakdown_limit ?? MAX_BREAKDOWN_VALUES;
  queryParams.breakdown_limit = breakdownLimit;
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property);
  const compiled = buildFunnelQuery(orderType, steps, exclusions, stepConditions, cohortExpr, samplingExpr, numSteps, queryParams, breakdownExpr);
  const result = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
  const rows = await result.json<RawBreakdownRow>();
  const stepResults = computePropertyBreakdownResults(rows, steps, numSteps);
  const totalBdCount = rows.length > 0 ? Number(rows[0].total_bd_count ?? 0) : 0;
  const breakdown_truncated = totalBdCount > breakdownLimit;

  // Run a separate no-breakdown query for aggregate_steps.
  const aggregateQueryParams = { ...queryParams };
  const aggregateCompiled = buildFunnelQuery(orderType, steps, exclusions, stepConditions, cohortExpr, samplingExpr, numSteps, aggregateQueryParams, undefined);
  const aggregateResult = await ch.query({ query: aggregateCompiled.sql, query_params: aggregateCompiled.params, format: 'JSONEachRow' });
  const aggregateRows = await aggregateResult.json<RawFunnelRow>();
  const aggregateSteps = computeStepResults(aggregateRows, steps, numSteps);

  return {
    breakdown: true,
    breakdown_property: params.breakdown_property,
    steps: stepResults,
    aggregate_steps: aggregateSteps,
    breakdown_truncated,
    ...samplingResult,
  };
}

// ── SQL assembly using ch-query builder ──────────────────────────────────────

function buildFunnelQuery(
  orderType: 'ordered' | 'strict' | 'unordered',
  steps: FunnelQueryParams['steps'],
  exclusions: NonNullable<FunnelQueryParams['exclusions']>,
  stepConditions: Expr[],
  cohortExpr: Expr | undefined,
  samplingExpr: Expr | undefined,
  numSteps: number,
  queryParams: FunnelChQueryParams,
  breakdownExpr?: Expr,
): CompiledQuery {
  const hasBreakdown = !!breakdownExpr;
  const includeTimestampCols = !hasBreakdown;

  // Build CTEs from the appropriate strategy
  let cteResult: { ctes: Array<{ name: string; query: QueryNode }>; hasExclusions: boolean };

  if (orderType === 'unordered') {
    cteResult = buildUnorderedFunnelCTEs({
      steps, exclusions, cohortExpr, samplingExpr, queryParams, breakdownExpr,
    });
  } else {
    cteResult = buildOrderedFunnelCTEs({
      steps,
      orderType,
      stepConditions,
      exclusions,
      cohortExpr,
      samplingExpr,
      numSteps,
      queryParams,
      breakdownExpr,
      includeTimestampCols,
    });
  }

  // Build SELECT columns
  const selectColumns: Expr[] = [];

  if (hasBreakdown) {
    selectColumns.push(col('breakdown_value'));
  }

  selectColumns.push(col('step_num'));
  selectColumns.push(
    countIf(gte(col('max_step'), col('step_num'))).as('entered'),
  );
  selectColumns.push(
    countIf(gte(col('max_step'), add(col('step_num'), literal(1)))).as('next_step'),
  );

  // Time columns for avg_time_to_convert (only for non-breakdown).
  if (includeTimestampCols) {
    selectColumns.push(avgTimeSecondsExpr());
  }

  // total_bd_count from breakdown_total CTE (for truncation detection)
  if (hasBreakdown) {
    selectColumns.push(
      subquery(select(col('total')).from('breakdown_total').build()).as('total_bd_count'),
    );
  }

  // Build the CROSS JOIN subquery for step numbers
  const stepsSubquery = buildStepsSubquery();

  // Build WHERE conditions
  const whereConditions: (Expr | undefined)[] = [];

  if (cteResult.hasExclusions) {
    whereConditions.push(notInExcludedUsers());
  }

  if (hasBreakdown) {
    const topRef = select(col('breakdown_value')).from('top_breakdown_values').build();
    whereConditions.push(
      or(
        inSubquery(col('breakdown_value'), topRef),
        eq(col('breakdown_value'), literal('')),
      ),
    );
  }

  // Build the outer SELECT query
  const builder = select(...selectColumns)
    .withAll(cteResult.ctes)
    .from('funnel_per_user')
    .crossJoin(stepsSubquery, 'steps');

  // Add breakdown CTEs if needed
  if (hasBreakdown) {
    const { topCTE, totalCTE } = buildTopBreakdownCTEs(cteResult.hasExclusions, queryParams);
    builder.with('top_breakdown_values', topCTE);
    builder.with('breakdown_total', totalCTE);
  }

  // Apply WHERE clause
  const filteredConditions = whereConditions.filter((c): c is Expr => c !== undefined);
  if (filteredConditions.length > 0) {
    builder.where(...filteredConditions);
  }

  // GROUP BY
  const groupByExprs: Expr[] = [];
  if (hasBreakdown) {groupByExprs.push(col('breakdown_value'));}
  groupByExprs.push(col('step_num'));
  builder.groupBy(...groupByExprs);

  // ORDER BY
  builder.orderBy(col('step_num'));

  // compile() extracts all namedParam/rawWithParams params from the AST.
  // Merge with queryParams for raw ClickHouse params ({window:UInt64}, {num_steps:UInt64}, etc.)
  const compiled = compile(builder.build());
  return {
    sql: compiled.sql,
    params: { ...queryParams, ...compiled.params },
  };
}

// ── Breakdown CTEs ───────────────────────────────────────────────────────────

/**
 * Builds the top_breakdown_values and breakdown_total CTEs as QueryNodes.
 *
 * - top_breakdown_values: top-N non-empty breakdown values by user count DESC
 * - breakdown_total: count of all distinct non-empty breakdown values (for truncation detection)
 */
function buildTopBreakdownCTEs(
  hasExclusions: boolean,
  queryParams: FunnelChQueryParams,
): { topCTE: SelectNode; totalCTE: SelectNode } {
  // Base conditions: max_step >= 1 and non-empty breakdown_value
  const baseConditions: Expr[] = [
    gte(col('max_step'), literal(1)),
    neq(col('breakdown_value'), literal('')),
  ];

  // Add exclusion filter if applicable
  if (hasExclusions) {
    baseConditions.push(notInExcludedUsers());
  }

  // top_breakdown_values: top-N by count DESC
  const topCTE = select(
    col('breakdown_value'),
    count().as('bd_count'),
  )
    .from('funnel_per_user')
    .where(and(...baseConditions))
    .groupBy(col('breakdown_value'))
    .orderBy(col('bd_count'), 'DESC')
    .limit(queryParams.breakdown_limit ?? MAX_BREAKDOWN_VALUES)
    .build();

  // breakdown_total: count of all distinct non-empty breakdown values
  const innerQuery = select(col('breakdown_value'))
    .from('funnel_per_user')
    .where(and(...baseConditions))
    .groupBy(col('breakdown_value'))
    .build();

  const totalCTE = select(
    count().as('total'),
  )
    .from(innerQuery)
    .build();

  return { topCTE, totalCTE };
}
