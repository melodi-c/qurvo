import {
  select,
  col,
  avgIf,
  and,
  gte,
  gt,
  eq,
  neq,
  lte,
  lt,
  add,
  sub,
  div,
  mod,
  literal,
  namedParam,
  inArray,
  inSubquery,
  notInSubquery,
  mul,
  toInt64,
  toUnixTimestamp64Milli,
  toUInt64,
  ifExpr,
  lambda,
  arrayExists,
  arrayMax,
  arrayMin,
  greatest,
  sipHash64,
  toString,
  func,
  length,
  parametricFunc,
  type Expr,
  type SelectNode,
} from '@qurvo/ch-query';
import { resolvedPerson } from '../query-helpers';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { FunnelStep, FunnelOrderType, FunnelStepResult } from './funnel.types';
import type { FunnelChQueryParams } from './funnel-params';
import { resolveStepEventNames } from './funnel-steps';

// ── Sampling ─────────────────────────────────────────────────────────────────

/**
 * WHERE-based sampling: deterministic per person_id (after identity merge), no SAMPLE BY needed.
 *
 * Sampling is applied on `RESOLVED_PERSON` (person_id) so that users with multiple
 * distinct_ids (e.g. anonymous pre-login + identified post-login) are either entirely
 * included or entirely excluded.
 *
 * Guard: returns undefined (no sampling) when samplingFactor is null, undefined, NaN, or >= 1.
 */
export function buildSamplingClause(
  samplingFactor: number | undefined,
): { expr: Expr; samplePct: number } | undefined {
  if (samplingFactor === null || samplingFactor === undefined || isNaN(samplingFactor) || samplingFactor >= 1) {return undefined;}
  const pct = Math.round(samplingFactor * 100);
  return {
    expr: lt(
      mod(sipHash64(toString(resolvedPerson())), literal(100)),
      namedParam('sample_pct', 'UInt8', pct),
    ),
    samplePct: pct,
  };
}

// ── windowFunnel expression ──────────────────────────────────────────────────

/**
 * Builds the windowFunnel() call as an Expr AST node.
 *
 * @param orderType  'ordered' | 'strict' — determines whether 'strict_order' param is added
 * @param stepConditions  Array of Expr conditions, one per funnel step
 * @returns Expr: `windowFunnel(window * 1000[, 'strict_order'])(toUInt64(toUnixTimestamp64Milli(timestamp)), cond0, cond1, ...)`
 */
export function buildWindowFunnelExpr(orderType: FunnelOrderType, stepConditions: Expr[], queryParams: FunnelChQueryParams): Expr {
  const windowMs = mul(namedParam('window', 'UInt64', queryParams.window), literal(1000));
  const params: Expr[] = orderType === 'strict'
    ? [windowMs, literal('strict_order')]
    : [windowMs];
  const tsArg = toUInt64(toUnixTimestamp64Milli(col('timestamp')));
  return parametricFunc('windowFunnel', params, [tsArg, ...stepConditions]);
}

// ── Unordered funnel validation ───────────────────────────────────────────────

export function validateUnorderedSteps(steps: FunnelStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    const namesA = new Set(resolveStepEventNames(steps[i]));
    for (let j = i + 1; j < steps.length; j++) {
      const namesB = resolveStepEventNames(steps[j]);
      const overlap = namesB.filter((n) => namesA.has(n));
      if (overlap.length > 0) {
        throw new AppBadRequestException(
          `Unordered funnel: steps ${i + 1} and ${j + 1} share event name(s) "${overlap.join('", "')}" — ` +
          `duplicate event names across steps are not supported in unordered mode`,
        );
      }
    }
  }
}

// ── Unordered coverage expressions ───────────────────────────────────────────

/**
 * Builds Expr AST nodes for the unordered funnel coverage logic:
 * max_step (maximum steps coverable from any candidate anchor) and
 * anchor_ms (timestamp of the best anchor).
 *
 * Used by funnel-unordered.sql.ts and funnel-time-to-convert.ts (unordered path).
 *
 * @param N        Total number of steps.
 * @param winExpr  Expr AST for the window in milliseconds.
 * @param stepsOrConds Array of length N used only for .map index iteration.
 */
export function buildUnorderedCoverageExprsAST(
  N: number,
  winExpr: Expr,
  stepsOrConds: readonly unknown[],
): {
  /** Expr for max achievable step from any candidate anchor. */
  maxStepExpr: Expr;
  /** Expr for the anchor millisecond timestamp. */
  anchorMsExpr: Expr;
} {
  /**
   * Coverage sum for a given anchor variable name.
   * For each step j: if(arrayExists(tJ -> tJ >= anchor AND tJ <= anchor + win, tJ_arr), 1, 0)
   * Summed across all steps via add().
   */
  const coverageSum = (anchorVarName: string): Expr => {
    const terms: Expr[] = stepsOrConds.map((_, j) =>
      ifExpr(
        arrayExists(
          lambda([`t${j}`], and(
            gte(col(`t${j}`), col(anchorVarName)),
            lte(col(`t${j}`), add(col(anchorVarName), winExpr)),
          )),
          col(`t${j}_arr`),
        ),
        literal(1),
        literal(0),
      ),
    );
    if (terms.length === 1) {return terms[0];}
    return terms.reduce((acc, term) => add(acc, term));
  };

  // maxStepExpr: greatest( arrayMax(a0 -> toInt64(coverage(a0)), t0_arr), ... )
  const maxFromEachStep: Expr[] = stepsOrConds.map((_, i) =>
    arrayMax(
      lambda([`a${i}`], toInt64(coverageSum(`a${i}`))),
      col(`t${i}_arr`),
    ),
  );
  const maxStepExpr: Expr = maxFromEachStep.length === 1
    ? maxFromEachStep[0]
    : greatest(...maxFromEachStep);

  // anchorMsExpr
  let anchorMsExpr: Expr;
  if (N === 1) {
    // if(length(t0_arr) > 0, arrayMin(t0_arr), toInt64(0))
    anchorMsExpr = ifExpr(
      gt(length(col('t0_arr')), literal(0)),
      arrayMin(col('t0_arr')),
      toInt64(literal(0)),
    );
  } else {
    // For each step i: arrayMax(arrayFilter(aI -> coverage(aI) = N, tI_arr))
    // Nested if-chain: if(toInt64(maxes[i]) != 0, toInt64(maxes[i]), <fallback>)
    const filteredMaxes: Expr[] = stepsOrConds.map((_, i) =>
      func('arrayMax',
        func('arrayFilter',
          lambda([`a${i}`], eq(coverageSum(`a${i}`), literal(N))),
          col(`t${i}_arr`),
        ),
      ),
    );

    anchorMsExpr = toInt64(literal(0));
    for (let i = filteredMaxes.length - 1; i >= 0; i--) {
      anchorMsExpr = ifExpr(
        neq(toInt64(filteredMaxes[i]), literal(0)),
        toInt64(filteredMaxes[i]),
        anchorMsExpr,
      );
    }
  }

  return { maxStepExpr, anchorMsExpr };
}

// ── Strict user filter ──────────────────────────────────────────────────────

/**
 * Builds the strict-mode user pre-filter as an Expr AST node.
 *
 * For strict mode: returns a `distinct_id IN (SELECT DISTINCT distinct_id FROM events WHERE ...)`
 * subquery that limits to users with at least one step event.
 * For non-strict: returns `event_name IN ({paramName:Array(String)})`.
 */
export function buildStrictUserFilterExpr(
  fromExpr: Expr,
  toExpr: Expr,
  paramName: string,
  allEventNames: string[],
  projectId: string,
  orderType: FunnelOrderType,
): Expr {
  if (orderType === 'strict') {
    const subQ = select(col('distinct_id'))
      .distinct()
      .from('events')
      .where(
        and(
          eq(col('project_id'), namedParam('project_id', 'UUID', projectId)),
          gte(col('timestamp'), fromExpr),
          lte(col('timestamp'), toExpr),
          inArray(col('event_name'), namedParam(paramName, 'Array(String)', allEventNames)),
        ),
      )
      .build();
    return inSubquery(col('distinct_id'), subQ);
  }
  return inArray(col('event_name'), namedParam(paramName, 'Array(String)', allEventNames));
}


// ── Shared funnel AST expressions ───────────────────────────────────────────

/**
 * Builds the avg_time_seconds AST expression, shared between funnel-query.ts and funnel-cohort-breakdown.ts.
 * `avgIf((last_step_ms - first_step_ms) / 1000.0, max_step >= N AND first_step_ms > 0 AND last_step_ms > first_step_ms)`
 */
export function avgTimeSecondsExpr(queryParams: FunnelChQueryParams): Expr {
  return avgIf(
    div(sub(col('last_step_ms'), col('first_step_ms')), literal(1000.0)),
    and(
      gte(col('max_step'), namedParam('num_steps', 'UInt64', queryParams.num_steps)),
      gt(col('first_step_ms'), literal(0)),
      gt(col('last_step_ms'), col('first_step_ms')),
    ),
  ).as('avg_time_seconds');
}

/**
 * Builds the CROSS JOIN subquery for step numbers: SELECT number + 1 AS step_num FROM numbers(N).
 * Shared between funnel-query.ts and funnel-cohort-breakdown.ts.
 *
 * `numSteps` is inlined directly into the SQL (safe — always a TypeScript number from `steps.length`).
 * This avoids a raw ClickHouse `{num_steps:UInt64}` parameter that would not be captured by `compile()`.
 */
export function stepsSubquery(numSteps: number): SelectNode {
  return select(
    add(col('number'), literal(1)).as('step_num'),
  )
    .from(`numbers(${numSteps})`)
    .build();
}

// ── Window milliseconds expression ──────────────────────────────────────────

/** `toInt64({window:UInt64}) * 1000` — window duration in milliseconds as an Expr AST node. */
export function windowMsExpr(queryParams: FunnelChQueryParams): Expr {
  return mul(toInt64(namedParam('window', 'UInt64', queryParams.window)), literal(1000));
}

// ── Shared funnel predicate helpers ─────────────────────────────────────────

/**
 * `person_id NOT IN (SELECT person_id FROM excluded_users)` — reusable exclusion filter.
 * Used in 5+ places across funnel query/TTC/cohort-breakdown files.
 */
export function notInExcludedUsers(): Expr {
  return notInSubquery(col('person_id'), select(col('person_id')).from('excluded_users').build());
}

/**
 * `project_id = {project_id:UUID}` — reusable funnel project_id filter.
 * Used in 4+ places across funnel files.
 */
export function funnelProjectIdExpr(queryParams: FunnelChQueryParams): Expr {
  return eq(col('project_id'), namedParam('project_id', 'UUID', queryParams.project_id));
}

// ── Empty step results ──────────────────────────────────────────────────────

/**
 * Generates N zero-valued step results for empty funnels.
 * Single source of truth for both computeStepResults and computeAggregateSteps.
 */
export function buildEmptyStepResults(steps: FunnelStep[]): FunnelStepResult[] {
  return steps.map((s, i) => ({
    step: i + 1,
    label: s.label ?? '',
    event_name: s.event_name,
    count: 0,
    conversion_rate: 0,
    drop_off: 0,
    drop_off_rate: 0,
    avg_time_to_convert_seconds: null,
  }));
}


