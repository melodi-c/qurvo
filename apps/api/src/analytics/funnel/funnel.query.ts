import type { ClickHouseClient } from '@qurvo/clickhouse';
import { buildCohortClause, toChTs } from '../../utils/clickhouse-helpers';
import { resolvePropertyExpr } from '../../utils/property-filter';
import { MAX_BREAKDOWN_VALUES } from '../../constants';
import type { FunnelQueryParams, FunnelQueryResult } from './funnel.types';
import {
  buildAllEventNames,
  buildBaseQueryParams,
  buildSamplingClause,
  buildStepCondition,
  validateExclusions,
  validateUnorderedSteps,
  type FunnelChQueryParams,
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

  if (orderType === 'unordered') {
    validateUnorderedSteps(steps);
  }

  const allEventNames = buildAllEventNames(steps, exclusions);
  const queryParams = buildBaseQueryParams(params, allEventNames);
  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams, toChTs(params.date_to, true));
  const samplingClause = buildSamplingClause(params.sampling_factor, queryParams);
  // Mirror the same guard used in buildSamplingClause: sampling is active only when
  // sampling_factor is a valid number < 1 (not null, not NaN, not >= 1).
  const sf = params.sampling_factor;
  const samplingResult = sf != null && !isNaN(sf) && sf < 1
    ? { sampling_factor: sf } : {};

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
  const breakdownLimit = params.breakdown_limit ?? MAX_BREAKDOWN_VALUES;
  queryParams.breakdown_limit = breakdownLimit;
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property);
  const sql = buildFunnelSQL(orderType, steps, exclusions, stepConditions, cohortClause, samplingClause, numSteps, queryParams, breakdownExpr);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawBreakdownRow>();
  const stepResults = computePropertyBreakdownResults(rows, steps, numSteps);
  // Count unique breakdown values: if it equals the limit, some values may have been truncated.
  const uniqueBreakdownValues = new Set(stepResults.map((r) => r.breakdown_value)).size;
  const breakdown_truncated = uniqueBreakdownValues >= breakdownLimit;
  return {
    breakdown: true,
    breakdown_property: params.breakdown_property,
    steps: stepResults,
    aggregate_steps: computeAggregateSteps(stepResults, steps),
    breakdown_truncated,
    ...samplingResult,
  };
}

// ── SQL assembly ─────────────────────────────────────────────────────────────

/**
 * Builds a top_breakdown_values CTE that limits property breakdown to top-N groups.
 *
 * The CTE selects breakdown values from funnel_per_user ordered by user count DESC
 * (users who entered at least step 1), limited to {breakdown_limit:UInt16}.
 * The exclFilter is incorporated so that excluded users don't inflate the top-N ranking.
 *
 * Returns the CTE SQL fragment (including leading comma) and a WHERE condition
 * to filter the outer query. When exclFilter is non-empty it is already a full
 * "WHERE ..." clause; here we need the inner condition only — so we extract it.
 */
function buildTopBreakdownCTE(exclFilter: string): { topCTE: string; breakdownFilter: string } {
  // exclFilter is either '' or '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
  const innerExclWhere = exclFilter
    ? '\n      AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';
  const topCTE = `,\n      top_breakdown_values AS (
        SELECT breakdown_value
        FROM funnel_per_user
        WHERE max_step >= 1${innerExclWhere}
        GROUP BY breakdown_value
        ORDER BY count() DESC
        LIMIT {breakdown_limit:UInt16}
      )`;
  const breakdownFilter = '\n      AND breakdown_value IN (SELECT breakdown_value FROM top_breakdown_values)';
  return { topCTE, breakdownFilter };
}

function buildFunnelSQL(
  orderType: 'ordered' | 'strict' | 'unordered',
  steps: FunnelQueryParams['steps'],
  exclusions: NonNullable<FunnelQueryParams['exclusions']>,
  stepConditions: string,
  cohortClause: string,
  samplingClause: string,
  numSteps: number,
  queryParams: FunnelChQueryParams,
  breakdownExpr?: string,
): string {
  const hasBreakdown = !!breakdownExpr;
  const breakdownSelect = hasBreakdown ? '\n        breakdown_value,' : '';
  const breakdownGroupBy = hasBreakdown ? 'breakdown_value, ' : '';
  const breakdownOrderBy = hasBreakdown ? 'breakdown_value, ' : '';
  const includeTimestampCols = !hasBreakdown;

  // Time columns for avg_time_to_convert (only for non-breakdown).
  //
  // Semantics: avg time from first step completion to last step completion, measured over
  // users who completed ALL N steps (max_step >= num_steps AND last_step_ms > first_step_ms).
  // The aggregate value is identical for every step_num in the CROSS JOIN — this is intentional:
  // each non-last step shows "the average full-funnel conversion time for users who completed
  // the entire funnel". The last step is set to null by computeStepResults (isLast check).
  //
  // For unordered funnels: first_step_ms = earliest step timestamp (anchor),
  // last_step_ms = latest qualifying step timestamp. Same total-conversion-time semantics apply.
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
    const { topCTE, breakdownFilter } = hasBreakdown
      ? buildTopBreakdownCTE(exclFilter)
      : { topCTE: '', breakdownFilter: '' };
    // For unordered, exclFilter is already a full WHERE clause.
    // When breakdown is active, we combine exclFilter (WHERE ...) with breakdownFilter (AND ...).
    const whereClause = buildWhereClause(exclFilter, breakdownFilter);
    return `
      WITH ${cte}${excludedUsersCTE}${topCTE}
      SELECT${breakdownSelect}
        step_num,
        countIf(max_step >= step_num) AS entered,
        countIf(max_step >= step_num + 1) AS next_step${avgTimeCols}
      FROM funnel_per_user
      CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${whereClause}
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
  const { topCTE, breakdownFilter } = hasBreakdown
    ? buildTopBreakdownCTE(exclFilter)
    : { topCTE: '', breakdownFilter: '' };
  const whereClause = buildWhereClause(exclFilter, breakdownFilter);
  return `
    WITH
      ${funnelPerUserCTE}${excludedUsersCTE}${topCTE}
    SELECT${breakdownSelect}
      step_num,
      countIf(max_step >= step_num) AS entered,
      countIf(max_step >= step_num + 1) AS next_step${avgTimeCols}
    FROM funnel_per_user
    CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${whereClause}
    GROUP BY ${breakdownGroupBy}step_num
    ORDER BY ${breakdownOrderBy}step_num`;
}

/**
 * Combines an existing WHERE clause (exclFilter) with an additional AND condition.
 * exclFilter is either '' or '\n      WHERE person_id NOT IN (...)'.
 * breakdownFilter is either '' or '\n      AND breakdown_value IN (...)'.
 */
function buildWhereClause(exclFilter: string, breakdownFilter: string): string {
  if (!exclFilter && !breakdownFilter) return '';
  if (exclFilter && !breakdownFilter) return exclFilter;
  if (!exclFilter && breakdownFilter) {
    // Convert the AND condition to a WHERE condition
    return breakdownFilter.replace(/^\n(\s*)AND /, '\n$1WHERE ');
  }
  // Both present: exclFilter is already "WHERE ...", append "AND ..."
  return exclFilter + breakdownFilter;
}
