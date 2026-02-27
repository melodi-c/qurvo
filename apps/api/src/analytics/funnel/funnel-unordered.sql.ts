import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildStepCondition,
  buildExclusionColumns,
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
 * Builds the unordered funnel CTEs using groupArrayIf + arrayExists anchor logic.
 *
 * Strategy:
 *   1. `step_times`: collect ALL per-step timestamps as arrays via `groupArrayIf`.
 *   2. `anchor_per_user`: intermediate CTE that computes max_step and anchor_ms
 *      using array lambdas — separated to allow anchor_ms to be referenced when
 *      computing last_step_ms without repeating the expensive expression.
 *   3. `funnel_per_user`: final shape expected by the outer query
 *      (max_step, first_step_ms, last_step_ms, breakdown_value, excl arrays).
 *
 * Key correctness fix over the old minIf + least() approach:
 *   The old code picked a single anchor = min(all step timestamps). A user who made
 *   step-0 at T1, step-1 at T1+8d (out of 7d window), then step-0 again at T2,
 *   step-1 at T2+1d — would have anchor = T1 and fail conversion despite the second
 *   attempt succeeding. The new approach tries ALL timestamps from ALL steps as potential
 *   anchors and takes the one that maximises the number of steps covered.
 *
 * For avg_time_to_convert:
 *   - anchor_ms  = first timestamp across all step arrays that covers all N steps.
 *   - last_step_ms = latest step timestamp in [anchor_ms, anchor_ms + window].
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
  const N = steps.length;
  const winExpr = `toInt64({window:UInt64}) * 1000`;

  const stepConds = steps.map((s, i) => buildStepCondition(s, i, queryParams));

  // ── Step 1: collect all timestamps per step as arrays ────────────────────
  const groupArrayCols = stepConds.map((cond, i) =>
    `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_arr`,
  ).join(',\n        ');

  // ── Step 2: coverage expression ─────────────────────────────────────────
  // coverage(a) = number of steps that have ≥ 1 occurrence in [a, a + W].
  // Each term is 1 if arrayExists finds a match, 0 otherwise.
  const coverageExpr = (anchorVar: string): string =>
    steps.map((_, j) =>
      `if(arrayExists(t${j} -> t${j} >= ${anchorVar} AND t${j} <= ${anchorVar} + ${winExpr}, t${j}_arr), 1, 0)`,
    ).join(' + ');

  // ── Step 3: max_step — best coverage achievable from any candidate anchor ──
  // For each step i: arrayMax(lambda, arr) returns the maximum lambda(element).
  // Returns 0 when the array is empty.
  const maxFromEachStep = steps.map((_, i) =>
    `arrayMax(a${i} -> toInt64(${coverageExpr(`a${i}`)}), t${i}_arr)`,
  );
  const maxStepExpr = maxFromEachStep.length === 1
    ? maxFromEachStep[0]!
    : `greatest(${maxFromEachStep.join(', ')})`;

  // ── Step 4: anchor_ms — first anchor achieving full coverage (all N steps) ──
  // arrayFirst(pred, arr): returns first element where pred(element) != 0; returns 0 if none.
  // We try each step array in turn and take the first non-zero result.
  let anchorMsExpr: string;
  if (N === 1) {
    // Single step: anchor = the minimum timestamp in the array (any event qualifies).
    anchorMsExpr = `if(length(t0_arr) > 0, arrayMin(t0_arr), toInt64(0))`;
  } else {
    const fullCovPred = (i: number): string =>
      `a${i} -> (${coverageExpr(`a${i}`)}) = ${N}`;
    const firsts = steps.map((_, i) =>
      `arrayFirst(${fullCovPred(i)}, t${i}_arr)`,
    );
    // Nested if/else: if(x0 != 0, x0, if(x1 != 0, x1, ... 0))
    let expr = `toInt64(0)`;
    for (let i = firsts.length - 1; i >= 0; i--) {
      expr = `if(toInt64(${firsts[i]}) != 0, toInt64(${firsts[i]}), ${expr})`;
    }
    anchorMsExpr = expr;
  }

  // ── Step 5: breakdown_value ───────────────────────────────────────────────
  // Pick the breakdown property value from the earliest step-0 event (consistent
  // with the ordered funnel's argMinIf approach).
  const breakdownCol = breakdownExpr
    ? `,\n        argMinIf(${breakdownExpr}, timestamp, ${stepConds[0]}) AS breakdown_value`
    : '';

  // ── Step 6: exclusion array columns ──────────────────────────────────────
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColsSQL = exclColumns.length > 0
    ? ',\n        ' + exclColumns.join(',\n        ')
    : '';

  // ── Forward columns from step_times into anchor_per_user ─────────────────
  const breakdownForward = breakdownExpr ? ',\n        breakdown_value' : '';
  const exclColsForward = exclColumns.length > 0
    ? ',\n        ' + exclColumns.map(col => col.split(' AS ')[1]!).join(',\n        ')
    : '';

  // ── Step 7: last_step_ms — latest step in the winning window ─────────────
  // For each step j: max timestamp in [anchor_ms, anchor_ms + W].
  // Uses greatest() across all steps; 0 when no matching event.
  const stepLastInWindow = steps.map((_, j) =>
    `arrayMax(lt${j} -> if(lt${j} >= anchor_ms AND lt${j} <= anchor_ms + ${winExpr}, lt${j}, toInt64(0)), t${j}_arr)`,
  );
  const lastStepMsExpr = stepLastInWindow.length === 1
    ? stepLastInWindow[0]!
    : `greatest(${stepLastInWindow.join(', ')})`;

  // ── WHERE guard on step_times ─────────────────────────────────────────────
  // At least one step array must be non-empty (the user has seen at least one funnel event).
  const anyStepNonEmpty = steps.map((_, i) => `length(t${i}_arr) > 0`).join(' OR ');

  // The query is split into two CTEs:
  //   anchor_per_user:  step_times + max_step + anchor_ms (can be used by last_step_ms)
  //   funnel_per_user:  final shape with last_step_ms derived from anchor_ms
  const cte = `step_times AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${groupArrayCols}${breakdownCol}${exclColsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ({all_event_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    anchor_per_user AS (
      SELECT
        person_id,
        toInt64(${maxStepExpr}) AS max_step,
        toInt64(${anchorMsExpr}) AS anchor_ms${breakdownForward}${exclColsForward},
        ${steps.map((_, i) => `t${i}_arr`).join(', ')}
      FROM step_times
      WHERE ${anyStepNonEmpty}
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        max_step,
        anchor_ms AS first_step_ms,
        toInt64(${lastStepMsExpr}) AS last_step_ms${breakdownForward}${exclColsForward}
      FROM anchor_per_user
    )`;

  const excludedUsersCTE = exclusions.length > 0
    ? ',\n      ' + buildExcludedUsersCTE(exclusions)
    : '';

  const exclFilter = exclusions.length > 0
    ? '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  return { cte, excludedUsersCTE, exclFilter };
}
