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

  // Optional first/last step timestamps for avg_time_to_convert.
  // Use full step conditions (not bare event_name =) so OR-logic steps are handled correctly:
  // a user who satisfies step 0 via any of the OR-events gets a valid first_step_ms.
  //
  // Ordered mode: minIf for first_step_ms (windowFunnel matches the FIRST step-0 occurrence),
  // minIf for last_step_ms (use first occurrence to avoid repeated last-step events inflating time).
  //
  // Strict mode heuristic: maxIf for first_step_ms — windowFunnel('strict_order') resets progress
  // on any intervening non-step event. If a user has an early failed attempt (step-0 → interruption)
  // followed by a successful attempt (step-0 → … → last), the LATEST step-0 is more likely to
  // correspond to the successful sequence, making avg_time_to_convert closer to the true value.
  // Using minIf in strict mode can overestimate by including elapsed time from an aborted attempt.
  //
  // This is a best-effort heuristic. Exact per-user strict_order timing would require replaying
  // the windowFunnel logic outside ClickHouse or using a UDF.
  // TODO(#474): Implement exact strict_order first_step_ms via UDF or multi-CTE approach.
  const firstStepAgg = orderType === 'strict' ? 'maxIf' : 'minIf';
  const timestampCols = includeTimestampCols
    ? `,\n              ${firstStepAgg}(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS first_step_ms,\n              minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond}) AS last_step_ms`
    : '';

  // Exclusion columns
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColumnsSQL = exclColumns.length > 0
    ? ',\n              ' + exclColumns.join(',\n              ')
    : '';

  const funnelPerUserCTE = `funnel_per_user AS (
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

  const excludedUsersCTE = exclusions.length > 0
    ? ',\n          ' + buildExcludedUsersCTE(exclusions)
    : '';

  const exclFilter = exclusions.length > 0
    ? '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  return { funnelPerUserCTE, excludedUsersCTE, exclFilter };
}
