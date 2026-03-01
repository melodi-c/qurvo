import type { CompilerContext} from '@qurvo/ch-query';
import { compileExprToSql, rawWithParams, select, raw, type QueryNode } from '@qurvo/ch-query';
import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildStepCondition,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildUnorderedCoverageExprs,
  funnelTsParamExpr,
  compileExprsToSqlColumns,
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
  const fromExpr = compileExprToSql(funnelTsParamExpr('from', queryParams), queryParams, ctx).sql;
  const toExpr = compileExprToSql(funnelTsParamExpr('to', queryParams), queryParams, ctx).sql;

  // Build step conditions as Expr, then compile to SQL strings for raw CTE body
  const stepCondExprs = steps.map((s, i) => buildStepCondition(s, i));
  const stepConds = stepCondExprs.map(expr => compileExprToSql(expr, queryParams, ctx).sql);

  // ── Step 1: collect all timestamps per step as arrays ────────────────────
  const groupArrayCols = stepConds.map((cond, i) =>
    `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_arr`,
  ).join(',\n        ');

  // ── Steps 2-4: coverage, max_step, anchor_ms — shared with TTC unordered ──
  const { maxStepExpr, anchorMsExpr } =
    buildUnorderedCoverageExprs(N, winExpr, steps);

  // ── Step 5: breakdown_value ───────────────────────────────────────────────
  const breakdownArrCol = breakdownExpr
    ? `,\n        groupArrayIf(${breakdownExpr}, ${stepConds[0]}) AS t0_bv_arr`
    : '';

  // ── Step 6: exclusion array columns ──────────────────────────────────────
  const exclExprList = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];
  const exclColumnsSql = exclExprList.length > 0
    ? compileExprsToSqlColumns(exclExprList, queryParams, ctx)
    : [];
  const exclColsSQL = exclColumnsSql.length > 0
    ? ',\n        ' + exclColumnsSql.join(',\n        ')
    : '';

  // ── Forward columns from step_times into anchor_per_user ─────────────────
  const breakdownArrForward = breakdownExpr ? ',\n        t0_bv_arr' : '';
  const exclColAliases = exclColumnsSql.map(c => {
    const m = / AS (\w+)$/.exec(c);
    return m ? m[1] : c;
  });
  const exclColsForward = exclColAliases.length > 0
    ? ',\n        ' + exclColAliases.join(',\n        ')
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
