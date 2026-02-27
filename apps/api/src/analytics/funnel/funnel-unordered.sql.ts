import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildStepCondition,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  funnelTsExpr,
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
 * Key correctness:
 *   Only step-0 timestamps are valid funnel anchors. This ensures users without the
 *   entry event are never counted as funnel entrants. A user who made step-0 at T1,
 *   step-1 at T1+8d (out of 7d window), then step-0 again at T2, step-1 at T2+1d —
 *   will use T2 as the anchor and correctly convert. Users with step-1/step-2 but no
 *   step-0 are excluded by the WHERE guard (length(t0_arr) > 0).
 *
 * For avg_time_to_convert:
 *   - anchor_ms  = first step-0 timestamp that covers all N steps within the window.
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
  const fromExpr = funnelTsExpr('from', queryParams);
  const toExpr = funnelTsExpr('to', queryParams);

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
  // Anchors are still tried from all step arrays to support out-of-order entry
  // (e.g. user does step-1 before step-0). The WHERE guard below (t0_arr non-empty)
  // ensures users without ANY step-0 event are excluded before this computation.
  const maxFromEachStep = steps.map((_, i) =>
    `arrayMax(a${i} -> toInt64(${coverageExpr(`a${i}`)}), t${i}_arr)`,
  );
  const maxStepExpr = maxFromEachStep.length === 1
    ? maxFromEachStep[0]!
    : `greatest(${maxFromEachStep.join(', ')})`;

  // ── Step 4: anchor_ms — latest anchor achieving full coverage (all N steps) ──
  // arrayMax(arrayFilter(pred, arr)): returns the maximum (latest) element satisfying
  // the predicate, independent of array order. arrayMax of an empty array returns 0.
  // We pick the LATEST qualifying anchor (not earliest) to match ordered-funnel
  // semantics (maxIf heuristic from issue #474) and to correctly scope exclusion
  // checks to the most recent conversion window (issue #497).
  // The original arrayFirst(pred, arr) was order-dependent because groupArrayIf
  // does not guarantee element order — replaced with arrayMax(arrayFilter(...))
  // which is deterministic regardless of storage order (issue #545).
  let anchorMsExpr: string;
  if (N === 1) {
    // Single step: anchor = the minimum timestamp in the array (any event qualifies).
    anchorMsExpr = `if(length(t0_arr) > 0, arrayMin(t0_arr), toInt64(0))`;
  } else {
    const fullCovPred = (i: number): string =>
      `a${i} -> (${coverageExpr(`a${i}`)}) = ${N}`;
    const maxes = steps.map((_, i) =>
      `arrayMax(arrayFilter(${fullCovPred(i)}, t${i}_arr))`,
    );
    // Nested if/else: if(x0 != 0, x0, if(x1 != 0, x1, ... 0))
    let expr = `toInt64(0)`;
    for (let i = maxes.length - 1; i >= 0; i--) {
      expr = `if(toInt64(${maxes[i]}) != 0, toInt64(${maxes[i]}), ${expr})`;
    }
    anchorMsExpr = expr;
  }

  // ── Step 5: breakdown_value ───────────────────────────────────────────────
  // Collect step-0 breakdown values as a parallel array alongside t0_arr.
  // In funnel_per_user (where anchor_ms is already resolved), we look up the
  // breakdown value at the exact anchor_ms position via indexOf(t0_arr, anchor_ms).
  // This correctly attributes breakdown to the winning anchor step-0, not the
  // globally earliest step-0 (which was the bug: argMinIf picked the wrong attempt).
  const breakdownArrCol = breakdownExpr
    ? `,\n        groupArrayIf(${breakdownExpr}, ${stepConds[0]}) AS t0_bv_arr`
    : '';

  // ── Step 6: exclusion array columns ──────────────────────────────────────
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColsSQL = exclColumns.length > 0
    ? ',\n        ' + exclColumns.join(',\n        ')
    : '';

  // ── Forward columns from step_times into anchor_per_user ─────────────────
  // t0_bv_arr is forwarded to anchor_per_user so funnel_per_user can resolve
  // breakdown_value from the anchor position.
  const breakdownArrForward = breakdownExpr ? ',\n        t0_bv_arr' : '';
  const exclColsForward = exclColumns.length > 0
    ? ',\n        ' + exclColumns.map(col => col.split(' AS ')[1]!).join(',\n        ')
    : '';

  // breakdown_value resolved in funnel_per_user using indexOf(t0_arr, anchor_ms)
  // so the value comes from the same index position as the winning anchor.
  const breakdownValueExpr = breakdownExpr
    ? `,\n        t0_bv_arr[indexOf(t0_arr, anchor_ms)] AS breakdown_value`
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
  // Step-0 must be present: a user without the entry event cannot enter the funnel.
  const anyStepNonEmpty = `length(t0_arr) > 0`;

  // The query is split into two CTEs:
  //   anchor_per_user:  step_times + max_step + anchor_ms (can be used by last_step_ms)
  //   funnel_per_user:  final shape with last_step_ms derived from anchor_ms
  const cte = `step_times AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${groupArrayCols}${breakdownArrCol}${exclColsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        AND event_name IN ({all_event_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    anchor_per_user AS (
      SELECT
        person_id,
        toInt64(${maxStepExpr}) AS max_step,
        toInt64(${anchorMsExpr}) AS anchor_ms${breakdownArrForward}${exclColsForward},
        ${steps.map((_, i) => `t${i}_arr`).join(', ')}
      FROM step_times
      WHERE ${anyStepNonEmpty}
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        max_step,
        anchor_ms AS first_step_ms,
        toInt64(${lastStepMsExpr}) AS last_step_ms${breakdownValueExpr}${exclColsForward}
      FROM anchor_per_user
    )`;

  // anchorFilter=true: restrict exclusion checks to (f, t) pairs where f >= first_step_ms
  // (the anchor window). This prevents historical clean sessions outside the anchor window
  // from masking tainted conversions within it — see issue #497 for the full scenario.
  const excludedUsersCTE = exclusions.length > 0
    ? ',\n      ' + buildExcludedUsersCTE(exclusions, true)
    : '';

  const exclFilter = exclusions.length > 0
    ? '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  return { cte, excludedUsersCTE, exclFilter };
}
