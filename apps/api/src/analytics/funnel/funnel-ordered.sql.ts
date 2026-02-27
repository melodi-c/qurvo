import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildWindowFunnelExpr,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildStepCondition,
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
    '                    AND timestamp >= {from:DateTime64(3)}',
    '                    AND timestamp <= {to:DateTime64(3)}',
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
  // Use argMinIf (pick by earliest timestamp) to make the result deterministic when
  // multiple events match the step condition (OR-logic or repeated events).
  const breakdownCol = breakdownExpr
    ? `,\n              argMinIf(${breakdownExpr}, timestamp, ${step0Cond}) AS breakdown_value`
    : '';

  // Optional first/last step timestamps for avg_time_to_convert.
  // Use full step conditions (not bare event_name =) so OR-logic steps are handled correctly:
  // a user who satisfies step 0 via any of the OR-events gets a valid first_step_ms.
  const timestampCols = includeTimestampCols
    ? `,\n              minIf(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS first_step_ms,\n              maxIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond}) AS last_step_ms`
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
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}${eventNameFilter}${cohortClause}${samplingClause}
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
