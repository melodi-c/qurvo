import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildWindowFunnelExpr,
  buildExclusionColumns,
  buildExcludedUsersCTE,
} from './funnel-sql-shared';

export interface OrderedCTEOptions {
  steps: FunnelStep[];
  orderType: 'ordered' | 'strict';
  stepConditions: string;
  exclusions: FunnelExclusion[];
  cohortClause: string;
  samplingClause: string;
  numSteps: number;
  queryParams: Record<string, unknown>;
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

  // Strict mode needs ALL events visible to windowFunnel('strict_order')
  const eventNameFilter = orderType === 'strict'
    ? ''
    : '\n                AND event_name IN ({all_event_names:Array(String)})';

  // Optional breakdown column
  const breakdownCol = breakdownExpr
    ? `,\n              anyIf(${breakdownExpr}, event_name = {step_0:String}) AS breakdown_value`
    : '';

  // Optional first/last step timestamps for avg_time_to_convert
  const timestampCols = includeTimestampCols
    ? `,\n              minIf(toUnixTimestamp64Milli(timestamp), event_name = {step_0:String}) AS first_step_ms,\n              maxIf(toUnixTimestamp64Milli(timestamp), event_name = {step_${numSteps - 1}:String}) AS last_step_ms`
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
