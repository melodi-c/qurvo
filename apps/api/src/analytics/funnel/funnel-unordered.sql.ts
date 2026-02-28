import type { CompilerContext} from '@qurvo/ch-query';
import { rawWithParams, select, raw, type QueryNode } from '@qurvo/ch-query';
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
  /** Shared CompilerContext to avoid p_N param collisions across multiple compileExprToSql calls. */
  ctx?: CompilerContext;
}

/**
 * Return type for the unordered funnel CTE builder.
 * Each CTE is a named QueryNode, composable via SelectBuilder.withAll().
 */
export interface UnorderedCTEResult {
  /** Named CTEs in dependency order (step_times, anchor_per_user, funnel_per_user, excluded_users?) */
  ctes: Array<{ name: string; query: QueryNode }>;
  /** Whether exclusions are active — caller uses this to build WHERE clause */
  hasExclusions: boolean;
}

/**
 * Builds the unordered funnel CTEs using groupArrayIf + arrayExists anchor logic.
 *
 * Strategy:
 *   1. `step_times`: collect ALL per-step timestamps as arrays via `groupArrayIf`.
 *   2. `anchor_per_user`: intermediate CTE that computes max_step and anchor_ms
 *      using array lambdas.
 *   3. `funnel_per_user`: final shape expected by the outer query
 *      (max_step, first_step_ms, last_step_ms, breakdown_value, excl arrays).
 *
 * Returns an array of named QueryNode CTEs that the caller attaches via .withAll().
 * CTE bodies are built as raw SQL via rawWithParams() — groupArrayIf(), arrayExists(),
 * and array lambda expressions have no typed builder equivalents.
 */
export function buildUnorderedFunnelCTEs(options: UnorderedCTEOptions): UnorderedCTEResult {
  const { steps, exclusions, cohortClause, samplingClause, queryParams, breakdownExpr, ctx } = options;
  const N = steps.length;
  const winExpr = `toInt64({window:UInt64}) * 1000`;
  const fromExpr = funnelTsExpr('from', queryParams);
  const toExpr = funnelTsExpr('to', queryParams);

  const stepConds = steps.map((s, i) => buildStepCondition(s, i, queryParams, ctx));

  // ── Step 1: collect all timestamps per step as arrays ────────────────────
  const groupArrayCols = stepConds.map((cond, i) =>
    `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_arr`,
  ).join(',\n        ');

  // ── Step 2: coverage expression ─────────────────────────────────────────
  const coverageExpr = (anchorVar: string): string =>
    steps.map((_, j) =>
      `if(arrayExists(t${j} -> t${j} >= ${anchorVar} AND t${j} <= ${anchorVar} + ${winExpr}, t${j}_arr), 1, 0)`,
    ).join(' + ');

  // ── Step 3: max_step — best coverage achievable from any candidate anchor ──
  const maxFromEachStep = steps.map((_, i) =>
    `arrayMax(a${i} -> toInt64(${coverageExpr(`a${i}`)}), t${i}_arr)`,
  );
  const maxStepExpr = maxFromEachStep.length === 1
    ? maxFromEachStep[0]
    : `greatest(${maxFromEachStep.join(', ')})`;

  // ── Step 4: anchor_ms — latest anchor achieving full coverage (all N steps) ──
  let anchorMsExpr: string;
  if (N === 1) {
    anchorMsExpr = `if(length(t0_arr) > 0, arrayMin(t0_arr), toInt64(0))`;
  } else {
    const fullCovPred = (i: number): string =>
      `a${i} -> (${coverageExpr(`a${i}`)}) = ${N}`;
    const maxes = steps.map((_, i) =>
      `arrayMax(arrayFilter(${fullCovPred(i)}, t${i}_arr))`,
    );
    let expr = `toInt64(0)`;
    for (let i = maxes.length - 1; i >= 0; i--) {
      expr = `if(toInt64(${maxes[i]}) != 0, toInt64(${maxes[i]}), ${expr})`;
    }
    anchorMsExpr = expr;
  }

  // ── Step 5: breakdown_value ───────────────────────────────────────────────
  const breakdownArrCol = breakdownExpr
    ? `,\n        groupArrayIf(${breakdownExpr}, ${stepConds[0]}) AS t0_bv_arr`
    : '';

  // ── Step 6: exclusion array columns ──────────────────────────────────────
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams, ctx)
    : [];
  const exclColsSQL = exclColumns.length > 0
    ? ',\n        ' + exclColumns.join(',\n        ')
    : '';

  // ── Forward columns from step_times into anchor_per_user ─────────────────
  const breakdownArrForward = breakdownExpr ? ',\n        t0_bv_arr' : '';
  const exclColsForward = exclColumns.length > 0
    ? ',\n        ' + exclColumns.map(c => c.split(' AS ')[1]).join(',\n        ')
    : '';

  const breakdownValueExpr = breakdownExpr
    ? `,\n        t0_bv_arr[indexOf(t0_arr, anchor_ms)] AS breakdown_value`
    : '';

  // ── Step 7: last_step_ms — latest step in the winning window ─────────────
  const stepLastInWindow = steps.map((_, j) =>
    `arrayMax(lt${j} -> if(lt${j} >= anchor_ms AND lt${j} <= anchor_ms + ${winExpr}, lt${j}, toInt64(0)), t${j}_arr)`,
  );
  const lastStepMsExpr = stepLastInWindow.length === 1
    ? stepLastInWindow[0]
    : `greatest(${stepLastInWindow.join(', ')})`;

  // ── WHERE guard on step_times ─────────────────────────────────────────────
  const anyStepNonEmpty = `length(t0_arr) > 0`;

  // ── Build CTEs as QueryNodes ──────────────────────────────────────────────

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  // CTE 1: step_times — aggregates per person with groupArrayIf per step.
  // Built as raw SQL — groupArrayIf() has no builder equivalent.
  const stepTimesNode = select(rawWithParams(`
        ${RESOLVED_PERSON} AS person_id,
        ${groupArrayCols}${breakdownArrCol}${exclColsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        AND event_name IN ({all_event_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id`, queryParams))
    .build();

  ctes.push({ name: 'step_times', query: stepTimesNode });

  // CTE 2: anchor_per_user — computes max_step and anchor_ms from arrays
  const anchorPerUserNode = select(raw(`
        person_id,
        toInt64(${maxStepExpr}) AS max_step,
        toInt64(${anchorMsExpr}) AS anchor_ms${breakdownArrForward}${exclColsForward},
        ${steps.map((_, i) => `t${i}_arr`).join(', ')}
      FROM step_times
      WHERE ${anyStepNonEmpty}`))
    .build();

  ctes.push({ name: 'anchor_per_user', query: anchorPerUserNode });

  // CTE 3: funnel_per_user — final shape with resolved timestamps
  const funnelPerUserNode = select(raw(`
        person_id,
        max_step,
        anchor_ms AS first_step_ms,
        toInt64(${lastStepMsExpr}) AS last_step_ms${breakdownValueExpr}${exclColsForward}
      FROM anchor_per_user`))
    .build();

  ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });

  // CTE 4: excluded_users (if exclusions present) — anchorFilter=true for unordered (#497)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions, true) });
  }

  return { ctes, hasExclusions: exclusions.length > 0 };
}
