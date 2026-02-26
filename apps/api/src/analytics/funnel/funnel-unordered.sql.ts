import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildStepCondition,
  buildExcludedUsersCTE,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

export interface UnorderedCTEOptions {
  steps: FunnelStep[];
  exclusions: FunnelExclusion[];
  cohortClause: string;
  samplingClause: string;
  queryParams: FunnelChQueryParams;
  breakdownExpr?: string;
}

/**
 * Builds the unordered funnel CTEs using anchor-based minIf logic.
 *
 * Returns the three SQL fragments that the caller wraps in
 * `WITH ${cte}${excludedUsersCTE} SELECT ... ${exclFilter}`.
 */
export function buildUnorderedFunnelCTEs(options: UnorderedCTEOptions): {
  cte: string;
  excludedUsersCTE: string;
  exclFilter: string;
} {
  const { steps, exclusions, cohortClause, samplingClause, queryParams, breakdownExpr } = options;
  const sentinel = 'toInt64(9007199254740992)';

  const stepConds = steps.map((s, i) => buildStepCondition(s, i, queryParams));

  const minIfCols = stepConds.map((cond, i) =>
    `minIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_ms`,
  ).join(',\n        ');

  // Use argMinIf (pick by earliest timestamp) to make breakdown deterministic when
  // OR-logic steps match multiple events with potentially different property values.
  const breakdownCol = breakdownExpr
    ? `,\n        argMinIf(${breakdownExpr}, timestamp, ${stepConds[0]}) AS breakdown_value`
    : '';

  const anchorArgs = steps.map((_, i) => `if(t${i}_ms > 0, t${i}_ms, ${sentinel})`).join(', ');

  const stepCountParts = steps.map(
    (_, i) => `if(t${i}_ms > 0 AND t${i}_ms >= anchor_ms AND t${i}_ms <= anchor_ms + ({window:UInt64} * 1000), 1, 0)`,
  ).join(' + ');

  const greatestArgs = steps.map(
    (_, i) => `if(t${i}_ms > 0 AND t${i}_ms >= anchor_ms AND t${i}_ms <= anchor_ms + ({window:UInt64} * 1000), t${i}_ms, toInt64(0))`,
  ).join(', ');

  const breakdownForward = breakdownExpr ? ',\n        breakdown_value' : '';

  const cte = `step_times AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${minIfCols}${breakdownCol}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ({all_event_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        least(${anchorArgs}) AS anchor_ms,
        (${stepCountParts}) AS max_step,
        least(${anchorArgs}) AS first_step_ms,
        greatest(${greatestArgs}) AS last_step_ms${breakdownForward}
      FROM step_times
      WHERE least(${anchorArgs}) < ${sentinel}
    )`;

  const excludedUsersCTE = exclusions.length > 0
    ? ',\n      ' + buildExcludedUsersCTE(exclusions)
    : '';

  const exclFilter = exclusions.length > 0
    ? '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  return { cte, excludedUsersCTE, exclFilter };
}
