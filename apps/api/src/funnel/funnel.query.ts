import type { ClickHouseClient } from '@qurvo/clickhouse';
import { buildCohortFilterClause } from '../cohorts/cohorts.query';
import { resolvePropertyExpr } from '../utils/property-filter';
import type { FunnelQueryParams, FunnelQueryResult } from './funnel.types';
import {
  buildAllEventNames,
  buildBaseQueryParams,
  buildSamplingClause,
  buildStepCondition,
  validateExclusions,
} from './funnel-sql-shared';
import { buildOrderedFunnelCTEs } from './funnel-ordered.sql';
import { buildUnorderedFunnelCTEs } from './funnel-unordered.sql';
import { runFunnelCohortBreakdown } from './funnel-cohort-breakdown';
import {
  computeStepResults,
  computePropertyBreakdownResults,
  computeAggregateSteps,
  type RawFunnelRow,
  type RawBreakdownRow,
} from './funnel-results';

// Re-export public API for consumers (funnel.service.ts, integration tests, etc.)
export * from './funnel.types';
export { buildStepCondition } from './funnel-sql-shared';
export { queryFunnelTimeToConvert } from './funnel-time-to-convert';

// ── Main funnel query ────────────────────────────────────────────────────────

export async function queryFunnel(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
): Promise<FunnelQueryResult> {
  const { steps, exclusions = [] } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const numSteps = steps.length;

  validateExclusions(exclusions, numSteps);

  const allEventNames = buildAllEventNames(steps, exclusions);
  const queryParams = buildBaseQueryParams(params, allEventNames);
  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';
  const samplingClause = buildSamplingClause(params.sampling_factor, queryParams);
  const samplingResult = params.sampling_factor && params.sampling_factor < 1
    ? { sampling_factor: params.sampling_factor } : {};

  // ── Cohort breakdown ────────────────────────────────────────────────────
  if (params.breakdown_cohort_ids?.length) {
    const { steps: bdSteps, aggregate_steps } = await runFunnelCohortBreakdown(
      ch, params, queryParams, stepConditions, cohortClause, samplingClause,
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
    const sql = buildFunnelSQL(orderType, steps, exclusions, stepConditions, cohortClause, samplingClause, numSteps, queryParams);
    const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await result.json<RawFunnelRow>();
    return { breakdown: false, steps: computeStepResults(rows, steps, numSteps), ...samplingResult };
  }

  // ── Property breakdown funnel ───────────────────────────────────────────
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property);
  const sql = buildFunnelSQL(orderType, steps, exclusions, stepConditions, cohortClause, samplingClause, numSteps, queryParams, breakdownExpr);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawBreakdownRow>();
  const stepResults = computePropertyBreakdownResults(rows, steps, numSteps);
  return {
    breakdown: true,
    breakdown_property: params.breakdown_property,
    steps: stepResults,
    aggregate_steps: computeAggregateSteps(stepResults, steps),
    ...samplingResult,
  };
}

// ── SQL assembly ─────────────────────────────────────────────────────────────

function buildFunnelSQL(
  orderType: 'ordered' | 'strict' | 'unordered',
  steps: FunnelQueryParams['steps'],
  exclusions: FunnelQueryParams['exclusions'] & any[],
  stepConditions: string,
  cohortClause: string,
  samplingClause: string,
  numSteps: number,
  queryParams: Record<string, unknown>,
  breakdownExpr?: string,
): string {
  const hasBreakdown = !!breakdownExpr;
  const breakdownSelect = hasBreakdown ? '\n        breakdown_value,' : '';
  const breakdownGroupBy = hasBreakdown ? 'breakdown_value, ' : '';
  const breakdownOrderBy = hasBreakdown ? 'breakdown_value, ' : '';
  const includeTimestampCols = !hasBreakdown;

  // Time columns for avg_time_to_convert (only for non-breakdown)
  const avgTimeCols = includeTimestampCols
    ? `,\n          avgIf(
            (last_step_ms - first_step_ms) / 1000.0,
            max_step >= {num_steps:UInt64} AND last_step_ms > first_step_ms
          ) AS avg_time_seconds`
    : '';

  if (orderType === 'unordered') {
    const { cte, excludedUsersCTE, exclFilter } = buildUnorderedFunnelCTEs({
      steps, exclusions, cohortClause, samplingClause, queryParams, breakdownExpr,
    });
    return `
      WITH ${cte}${excludedUsersCTE}
      SELECT${breakdownSelect}
        step_num,
        countIf(max_step >= step_num) AS entered,
        countIf(max_step >= step_num + 1) AS next_step${avgTimeCols}
      FROM funnel_per_user
      CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
      GROUP BY ${breakdownGroupBy}step_num
      ORDER BY ${breakdownOrderBy}step_num`;
  }

  // Ordered / Strict
  const { funnelPerUserCTE, excludedUsersCTE, exclFilter } = buildOrderedFunnelCTEs({
    steps,
    orderType,
    stepConditions,
    exclusions,
    cohortClause,
    samplingClause,
    numSteps,
    queryParams,
    breakdownExpr,
    includeTimestampCols,
  });
  return `
    WITH
      ${funnelPerUserCTE}${excludedUsersCTE}
    SELECT${breakdownSelect}
      step_num,
      countIf(max_step >= step_num) AS entered,
      countIf(max_step >= step_num + 1) AS next_step${avgTimeCols}
    FROM funnel_per_user
    CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
    GROUP BY ${breakdownGroupBy}step_num
    ORDER BY ${breakdownOrderBy}step_num`;
}
