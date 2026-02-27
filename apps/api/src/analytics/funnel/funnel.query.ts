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

  validateExclusions(exclusions, numSteps, steps);

  if (orderType === 'unordered') {
    validateUnorderedSteps(steps);
  }

  const allEventNames = buildAllEventNames(steps, exclusions);
  const queryParams = buildBaseQueryParams(params, allEventNames);
  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams, toChTs(params.date_to, true, params.timezone), toChTs(params.date_from, false, params.timezone));
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
  // total_bd_count is the count of ALL distinct non-empty breakdown values (no LIMIT applied),
  // returned as a constant on every row from the breakdown_total CTE.
  // breakdown_truncated is true only when the total exceeds the limit (real truncation).
  const totalBdCount = rows.length > 0 ? Number(rows[0]!.total_bd_count ?? 0) : 0;
  const breakdown_truncated = totalBdCount > breakdownLimit;

  // Run a separate no-breakdown query for aggregate_steps.
  // aggregate_steps must count ALL users who entered the funnel, regardless of whether their
  // breakdown_property value falls in the top-N. Without this, aggregate_steps[0].count would
  // be up to (100 - fill_rate)% lower than the real total when breakdown_property is sparse.
  const aggregateQueryParams = { ...queryParams };
  const aggregateSql = buildFunnelSQL(orderType, steps, exclusions, stepConditions, cohortClause, samplingClause, numSteps, aggregateQueryParams);
  const aggregateResult = await ch.query({ query: aggregateSql, query_params: aggregateQueryParams, format: 'JSONEachRow' });
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

// ── SQL assembly ─────────────────────────────────────────────────────────────

/**
 * Builds CTEs for property breakdown top-N selection.
 *
 * Two CTEs are emitted:
 * - `top_breakdown_values` — selects the top-N non-empty breakdown values by user count DESC.
 *   Excludes empty string ('') so that (none) users never displace real property values from top-N.
 *   Stores `count() AS bd_count` for use in ORDER BY.
 * - `breakdown_total` — counts all distinct non-empty breakdown values (without LIMIT) so that the
 *   caller can accurately determine whether results were truncated.
 *
 * The `breakdownFilter` allows both real top-N values AND empty-string (none) users through,
 * ensuring (none) always appears in results without consuming a top-N slot.
 *
 * Returns CTE SQL fragments (with leading comma) and the WHERE condition for the outer query.
 */
function buildTopBreakdownCTE(exclFilter: string): {
  topCTE: string;
  breakdownFilter: string;
} {
  // exclFilter is either '' or '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
  const innerExclWhere = exclFilter
    ? '\n      AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';
  // Exclude '' from top-N ranking so (none) does not displace real values.
  // `bd_count` is stored for ORDER BY use in the outer query.
  const topCTE = `,\n      top_breakdown_values AS (
        SELECT breakdown_value, count() AS bd_count
        FROM funnel_per_user
        WHERE max_step >= 1 AND breakdown_value != ''${innerExclWhere}
        GROUP BY breakdown_value
        ORDER BY bd_count DESC
        LIMIT {breakdown_limit:UInt16}
      ),
      breakdown_total AS (
        SELECT count() AS total
        FROM (
          SELECT breakdown_value
          FROM funnel_per_user
          WHERE max_step >= 1 AND breakdown_value != ''${innerExclWhere}
          GROUP BY breakdown_value
        )
      )`;
  // Allow real top-N values OR empty-string (none) users to pass through.
  const breakdownFilter =
    '\n      AND (breakdown_value IN (SELECT breakdown_value FROM top_breakdown_values) OR breakdown_value = \'\')';
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
  // Include total_bd_count from the breakdown_total CTE so that the caller can determine
  // whether results were truncated (total > breakdownLimit).
  const totalBdCountSelect = hasBreakdown
    ? ',\n        (SELECT total FROM breakdown_total) AS total_bd_count'
    : '';
  const breakdownGroupBy = hasBreakdown ? 'breakdown_value, ' : '';
  // Groups are returned by step_num only — TypeScript sorts groups by popularity after receipt.
  const breakdownOrderBy = '';
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
        countIf(max_step >= step_num + 1) AS next_step${avgTimeCols}${totalBdCountSelect}
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
      countIf(max_step >= step_num + 1) AS next_step${avgTimeCols}${totalBdCountSelect}
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
