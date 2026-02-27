import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildWindowFunnelExpr,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildStepCondition,
  funnelTsExpr,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

export interface OrderedCTEOptions {
  steps: FunnelStep[];
  orderType: 'ordered' | 'strict';
  stepConditions: string;
  exclusions: FunnelExclusion[];
  cohortClause: string;
  samplingClause: string;
  numSteps: number;
  queryParams: FunnelChQueryParams;
  breakdownExpr?: string;
  includeTimestampCols?: boolean;
}

/**
 * Builds the ordered/strict funnel CTEs using windowFunnel().
 *
 * Returns the three SQL fragments that the caller wraps in
 * `WITH ${funnelPerUserCTE}${excludedUsersCTE} SELECT ... ${exclFilter}`.
 */
export function buildOrderedFunnelCTEs(options: OrderedCTEOptions): {
  funnelPerUserCTE: string;
  excludedUsersCTE: string;
  exclFilter: string;
} {
  const {
    steps, orderType, stepConditions, exclusions, cohortClause,
    samplingClause, numSteps, queryParams, breakdownExpr, includeTimestampCols,
  } = options;

  const wfExpr = buildWindowFunnelExpr(orderType, stepConditions);
  const fromExpr = funnelTsExpr('from', queryParams);
  const toExpr = funnelTsExpr('to', queryParams);

  // Ordered mode: filter to only funnel-relevant events (step + exclusion names) for efficiency.
  // Strict mode: windowFunnel('strict_order') resets progress on any intervening event that
  // doesn't match the current or next expected step. So it must see ALL events for correctness.
  // However, we still pre-filter to users who have at least one funnel step event — this avoids
  // scanning every event for users who would never enter the funnel (e.g. pageview-only users).
  // Semantics are preserved: step events that pass the subquery filter are still present;
  // non-step events for qualifying users are included in the outer scan so strict_order can
  // detect and reset on them.
  const strictUserFilter = [
    '',
    '                AND distinct_id IN (',
    '                  SELECT DISTINCT distinct_id',
    '                  FROM events',
    '                  WHERE project_id = {project_id:UUID}',
    `                    AND timestamp >= ${fromExpr}`,
    `                    AND timestamp <= ${toExpr}`,
    '                    AND event_name IN ({all_event_names:Array(String)})',
    '                )',
  ].join('\n');
  const eventNameFilter = orderType === 'strict'
    ? strictUserFilter
    : '\n                AND event_name IN ({all_event_names:Array(String)})';

  // Build full step conditions for step 0 and last step — these handle OR-logic
  // (event_names with multiple entries) correctly, unlike a bare `event_name = {step_0:String}`.
  const step0Cond = buildStepCondition(steps[0]!, 0, queryParams);
  const lastStepCond = buildStepCondition(steps[numSteps - 1]!, numSteps - 1, queryParams);

  // Optional breakdown column.
  //
  // Ordered mode: argMinIf (pick by earliest timestamp) — windowFunnel('ordered') always
  // matches the first occurrence of step-0, so the earliest step-0 breakdown_value is correct.
  //
  // Strict mode heuristic: argMaxIf (pick by latest timestamp) — windowFunnel('strict_order')
  // resets funnel progress when any intervening event appears between steps. If a user has a
  // failed attempt (step-0 → interruption) followed by a successful attempt (step-0 → … → last),
  // the latest step-0 occurrence is more likely to be the beginning of the successful sequence.
  // This is a best-effort heuristic: ClickHouse's windowFunnel only returns max_step, not the
  // timestamps of the matching sequence, so there is no way to determine the exact breakdown_value
  // of the successful step-0 in a single aggregation pass without a UDF or additional CTE.
  //
  // TODO(#474): For an exact solution, the funnel query would need to be rewritten to identify
  // the specific step-0 event that started the successful strict_order sequence — this requires
  // either a ClickHouse UDF or a multi-CTE approach that replays the strict_order window per user.
  const breakdownCol = breakdownExpr
    ? `,\n              ${orderType === 'strict' ? 'argMaxIf' : 'argMinIf'}(${breakdownExpr}, timestamp, ${step0Cond}) AS breakdown_value`
    : '';

  // Exclusion columns
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColumnsSQL = exclColumns.length > 0
    ? ',\n              ' + exclColumns.join(',\n              ')
    : '';

  // Build the funnel_per_user CTE. For ordered mode with timestamp columns, we use a two-CTE
  // approach to correctly compute first_step_ms for users with multiple funnel attempts.
  //
  // Problem with single-CTE minIf approach (ordered mode):
  //   A user with step_0=Jan1 (no step_1 within window), then step_0=Feb1, step_1=Feb3 would get:
  //   first_step_ms = Jan1 (global minIf), last_step_ms = Feb3 → 33 days instead of 2 days.
  //
  // Fix (ordered mode): collect step_0 timestamps as an array, then in a second CTE derive
  //   first_step_ms = earliest step_0 where last_step_ms falls within [step_0, step_0 + window].
  //   This identifies the specific attempt that windowFunnel('ordered') matched.
  //
  // Strict mode: keep the existing maxIf heuristic (documented as best-effort in #474).
  //   The strict_order scenario where a user has step_0 → interruption → step_0 → step_1 is
  //   actually not convertible via windowFunnel('strict_order') in ClickHouse (the interruption
  //   resets the attempt and subsequent attempts also reset). The maxIf heuristic still applies
  //   to the simple repeated step_0 case (no interruption between them).

  let funnelPerUserCTE: string;

  if (includeTimestampCols && orderType === 'ordered') {
    // Two-CTE approach for ordered mode: collect step_0 timestamps + last_step_ms in raw CTE,
    // then derive the correct first_step_ms (anchor of the successful window) in funnel_per_user.
    const winMs = `toInt64({window:UInt64}) * 1000`;

    const rawCTE = `funnel_raw AS (
            SELECT
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step${breakdownCol},
              groupArrayIf(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS t0_arr,
              toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond})) AS last_step_ms${exclColumnsSQL}
            FROM events
            WHERE
              project_id = {project_id:UUID}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}
            GROUP BY person_id
          )`;

    // Forward exclusion column names from raw CTE into funnel_per_user.
    const exclColsForward = exclColumns.length > 0
      ? ',\n              ' + exclColumns.map(col => col.split(' AS ')[1]!).join(',\n              ')
      : '';

    const breakdownForward = breakdownExpr ? ',\n              breakdown_value' : '';

    // first_step_ms: earliest step_0 timestamp where last_step_ms falls within [t0, t0 + window].
    //
    // windowFunnel('ordered') starts from the first eligible step_0 occurrence — so when
    // multiple step_0 timestamps could anchor a valid window, the earliest one that leads to
    // a successful conversion is the correct starting point for avg_time_to_convert.
    //
    // Algorithm:
    //   1. Filter t0_arr to only elements where last_step_ms ∈ [t0, t0 + window].
    //   2. Take arrayMin of the filtered set (the earliest valid anchor).
    //   3. When the filtered set is empty (no valid anchor) or last_step_ms = 0 (no step_N
    //      event found), return 0 so that the avgIf guard (last_step_ms > first_step_ms)
    //      excludes non-converters from avg_time_to_convert.
    //
    // Example — issue #493 scenario (window = 7d):
    //   t0_arr = [Jan1, Feb1], last_step_ms = Feb3
    //   filtered = [Feb1]  (Jan1: Feb3 > Jan1+7d → excluded; Feb1: Feb3 ≤ Feb1+7d → included)
    //   first_step_ms = arrayMin([Feb1]) = Feb1 → 2 days ✓ (not 33 days from Jan1)
    //
    // Example — single attempt (window = 7d):
    //   t0_arr = [T-60s, T-30s], last_step_ms = T-10s
    //   filtered = [T-60s, T-30s]  (both within 7-day window)
    //   first_step_ms = arrayMin([T-60s, T-30s]) = T-60s → 50s ✓ (matches windowFunnel)
    const firstStepMsExpr = `if(
              notEmpty(arrayFilter(t0 -> t0 <= last_step_ms AND last_step_ms <= t0 + ${winMs} AND last_step_ms > 0, t0_arr)),
              toInt64(arrayMin(arrayFilter(t0 -> t0 <= last_step_ms AND last_step_ms <= t0 + ${winMs} AND last_step_ms > 0, t0_arr))),
              toInt64(0)
            )`;

    funnelPerUserCTE = `${rawCTE},
          funnel_per_user AS (
            SELECT
              person_id,
              max_step${breakdownForward},
              ${firstStepMsExpr} AS first_step_ms,
              last_step_ms${exclColsForward}
            FROM funnel_raw
          )`;
  } else {
    // Single-CTE approach: strict mode (maxIf heuristic) or no timestamp columns needed.
    //
    // Strict mode heuristic: maxIf for first_step_ms — windowFunnel('strict_order') resets
    // progress on any intervening non-step event. If a user has an early failed attempt
    // (step-0 → interruption) followed by a successful attempt (step-0 → … → last), the LATEST
    // step-0 is more likely to correspond to the successful sequence, making avg_time_to_convert
    // closer to the true value.
    // This is a best-effort heuristic. Exact per-user strict_order timing would require replaying
    // the windowFunnel logic outside ClickHouse or using a UDF.
    // TODO(#474): Implement exact strict_order first_step_ms via UDF or multi-CTE approach.
    const firstStepAgg = orderType === 'strict' ? 'maxIf' : 'minIf';
    const timestampCols = includeTimestampCols
      ? `,\n              ${firstStepAgg}(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS first_step_ms,\n              minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond}) AS last_step_ms`
      : '';

    funnelPerUserCTE = `funnel_per_user AS (
            SELECT
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step${breakdownCol}${timestampCols}${exclColumnsSQL}
            FROM events
            WHERE
              project_id = {project_id:UUID}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}
            GROUP BY person_id
          )`;
  }

  const excludedUsersCTE = exclusions.length > 0
    ? ',\n          ' + buildExcludedUsersCTE(exclusions)
    : '';

  const exclFilter = exclusions.length > 0
    ? '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  return { funnelPerUserCTE, excludedUsersCTE, exclFilter };
}
