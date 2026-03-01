import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import {
  rawWithParams,
  raw,
  select,
  col,
  avgIf,
  and,
  gte,
  gt,
  eq,
  neq,
  lte,
  literal,
  add,
  namedParam,
  inArray,
  inSubquery,
  groupArrayIf,
  toUnixTimestamp64Milli,
  toInt64,
  parametricFunc,
  toUInt64,
  mul,
  ifExpr,
  lambda,
  arrayExists,
  arrayMax,
  arrayMin,
  greatest,
  func,
  type Expr,
  type SelectNode,
} from '@qurvo/ch-query';
import { toChTs, RESOLVED_PERSON, propertyFilters } from '../query-helpers';
import type { FunnelStep, FunnelExclusion, FunnelOrderType, FunnelStepResult } from './funnel.types';

export { RESOLVED_PERSON, toChTs };

// ── ClickHouse query parameter types ─────────────────────────────────────────

/**
 * Static base parameters shared by all funnel queries.
 * After the Expr AST migration, dynamic per-step and per-filter keys are no
 * longer injected manually — they are embedded in the AST via `namedParam()`.
 *
 * Static keys:
 *   project_id     — UUID of the project
 *   from           — start of the date range (ClickHouse DateTime string)
 *   to             — end of the date range (ClickHouse DateTime string)
 *   window         — conversion window in seconds (UInt64)
 *   num_steps      — total number of funnel steps (UInt64)
 *   all_event_names — all event names across steps and exclusions (Array(String))
 *   tz             — IANA timezone name (optional, only when tz != 'UTC')
 *   sample_pct     — sampling percentage 0-100 (UInt8, only when sampling is active)
 *   breakdown_limit — max breakdown groups (optional)
 */
export interface FunnelChQueryParams {
  project_id: string;
  from: string;
  to: string;
  /** IANA timezone name, present only when the query is timezone-aware (tz != 'UTC'). */
  tz?: string;
  window: number;
  num_steps: number;
  all_event_names: string[];
  breakdown_limit?: number;
  [key: string]: unknown;
}

/**
 * Returns the timestamp parameter as an Expr AST node.
 * When the query params include a `tz` value, wraps with toDateTime64(..., tz).
 *
 * Uses fixed parameter names (`from`, `to`, `tz`) matching the keys in queryParams,
 * not auto-incrementing p_N, to avoid parameter collisions when called without a shared
 * CompilerContext (e.g. cohort breakdown loop).
 */
export function funnelTsParamExpr(paramName: 'from' | 'to', queryParams: FunnelChQueryParams): Expr {
  const hasTz = !!queryParams.tz;
  return hasTz
    ? rawWithParams(`toDateTime64({${paramName}:String}, 3, {tz:String})`, { [paramName]: queryParams[paramName], tz: queryParams.tz })
    : rawWithParams(`{${paramName}:DateTime64(3)}`, { [paramName]: queryParams[paramName] });
}


// ── Conversion window ────────────────────────────────────────────────────────

const UNIT_TO_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000, // 30 days
};

export function resolveWindowSeconds(params: {
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: string;
}): number {
  const hasValue = params.conversion_window_value !== null && params.conversion_window_value !== undefined;
  const hasUnit = !!params.conversion_window_unit;

  if (hasValue && !hasUnit) {
    throw new AppBadRequestException(
      'conversion_window_value requires conversion_window_unit to be specified',
    );
  }
  if (hasUnit && !hasValue) {
    throw new AppBadRequestException(
      'conversion_window_unit requires conversion_window_value to be specified',
    );
  }

  const MAX_WINDOW_SECONDS = 90 * 86400; // 90 days, same limit as conversion_window_days

  if (hasValue && hasUnit) {
    const unit = params.conversion_window_unit ?? '';
    const multiplier = UNIT_TO_SECONDS[unit] ?? 86400;
    const resolved = (params.conversion_window_value ?? 0) * multiplier;
    if (resolved > MAX_WINDOW_SECONDS) {
      throw new AppBadRequestException(
        `conversion_window_value * conversion_window_unit exceeds the maximum allowed window of 90 days (${MAX_WINDOW_SECONDS} seconds). Got ${resolved} seconds.`,
      );
    }
    return resolved;
  }
  return params.conversion_window_days * 86400;
}

// ── Step helpers ─────────────────────────────────────────────────────────────

/** Returns all event names for a step (supports OR-logic via event_names). */
export function resolveStepEventNames(step: FunnelStep): string[] {
  if (step.event_names?.length) {return step.event_names;}
  return [step.event_name];
}

/**
 * Builds the windowFunnel condition for one step as an Expr AST node.
 *
 * Uses `namedParam()` to embed step event names directly in the AST — the compiler
 * extracts parameters automatically, eliminating manual queryParams mutation.
 */
export function buildStepCondition(
  step: FunnelStep,
  idx: number,
): Expr {
  const names = resolveStepEventNames(step);
  const eventCond: Expr = names.length === 1
    ? eq(col('event_name'), namedParam(`step_${idx}`, 'String', names[0]))
    : inArray(col('event_name'), namedParam(`step_${idx}_names`, 'Array(String)', names));

  const filtersExpr = propertyFilters(step.filters ?? []);
  if (!filtersExpr) {return eventCond;}

  return and(eventCond, filtersExpr);
}

/** Collects all unique event names across steps and exclusions. */
export function buildAllEventNames(steps: FunnelStep[], exclusions: FunnelExclusion[] = []): string[] {
  const names = new Set<string>();
  for (const s of steps) {
    for (const n of resolveStepEventNames(s)) {names.add(n);}
  }
  for (const e of exclusions) {names.add(e.event_name);}
  return Array.from(names);
}

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
  queryParams: FunnelChQueryParams,
): Expr | undefined {
  if (samplingFactor === null || samplingFactor === undefined || isNaN(samplingFactor) || samplingFactor >= 1) {return undefined;}
  const pct = Math.round(samplingFactor * 100);
  queryParams.sample_pct = pct;
  return rawWithParams(
    `sipHash64(toString(${RESOLVED_PERSON})) % 100 < {sample_pct:UInt8}`,
    { sample_pct: pct },
  );
}

// ── windowFunnel expression ──────────────────────────────────────────────────

/**
 * Builds the windowFunnel() call as an Expr AST node.
 *
 * @param orderType  'ordered' | 'strict' — determines whether 'strict_order' param is added
 * @param stepConditions  Array of Expr conditions, one per funnel step
 * @returns Expr: `windowFunnel(window * 1000[, 'strict_order'])(toUInt64(toUnixTimestamp64Milli(timestamp)), cond0, cond1, ...)`
 */
export function buildWindowFunnelExpr(orderType: FunnelOrderType, stepConditions: Expr[]): Expr {
  const windowMs = mul(raw('{window:UInt64}'), literal(1000));
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

// ── Exclusion helpers ────────────────────────────────────────────────────────

export function validateExclusions(
  exclusions: FunnelExclusion[],
  numSteps: number,
  steps?: FunnelStep[],
): void {
  for (const excl of exclusions) {
    if (excl.funnel_from_step >= excl.funnel_to_step) {
      throw new AppBadRequestException(
        `Exclusion "${excl.event_name}": funnel_from_step must be < funnel_to_step`,
      );
    }
    if (excl.funnel_to_step >= numSteps) {
      throw new AppBadRequestException(
        `Exclusion "${excl.event_name}": funnel_to_step ${excl.funnel_to_step} out of range (max ${numSteps - 1})`,
      );
    }
    if (steps) {
      for (const step of steps) {
        const stepNames = resolveStepEventNames(step);
        if (stepNames.includes(excl.event_name) && !excl.filters?.length) {
          throw new AppBadRequestException(
            `Exclusion "${excl.event_name}" shares the same event name with a funnel step but has no ` +
            `property filters to distinguish them. Add property filters to the exclusion to avoid ` +
            `false exclusions, or use a different event name.`,
          );
        }
      }
    }
  }
}

/**
 * Builds per-user array columns for exclusion checking as Expr AST nodes.
 *
 * Returns an array of aliased Expr nodes:
 *   groupArrayIf(toUnixTimestamp64Milli(timestamp), fromCond) AS excl_0_from_arr
 *   groupArrayIf(toUnixTimestamp64Milli(timestamp), toCond) AS excl_0_to_arr
 *   groupArrayIf(toUnixTimestamp64Milli(timestamp), exclCond) AS excl_0_arr
 */
export function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
): Expr[] {
  const exprs: Expr[] = [];
  for (const [i, excl] of exclusions.entries()) {
    const fromNames = resolveStepEventNames(steps[excl.funnel_from_step]);
    const toNames = resolveStepEventNames(steps[excl.funnel_to_step]);

    const fromCond: Expr = fromNames.length === 1
      ? eq(col('event_name'), namedParam(`excl_${i}_from_step_name`, 'String', fromNames[0]))
      : inArray(col('event_name'), namedParam(`excl_${i}_from_step_names`, 'Array(String)', fromNames));

    const toCond: Expr = toNames.length === 1
      ? eq(col('event_name'), namedParam(`excl_${i}_to_step_name`, 'String', toNames[0]))
      : inArray(col('event_name'), namedParam(`excl_${i}_to_step_names`, 'Array(String)', toNames));

    const exclFiltersExpr = propertyFilters(excl.filters ?? []);
    const exclCond: Expr = exclFiltersExpr
      ? and(eq(col('event_name'), namedParam(`excl_${i}_name`, 'String', excl.event_name)), exclFiltersExpr)
      : eq(col('event_name'), namedParam(`excl_${i}_name`, 'String', excl.event_name));

    const tsExpr = toUnixTimestamp64Milli(col('timestamp'));
    exprs.push(
      groupArrayIf(tsExpr, fromCond).as(`excl_${i}_from_arr`),
      groupArrayIf(tsExpr, toCond).as(`excl_${i}_to_arr`),
      groupArrayIf(tsExpr, exclCond).as(`excl_${i}_arr`),
    );
  }
  return exprs;
}

/**
 * Builds the excluded_users WHERE condition as a raw SQL string.
 *
 * A user is placed in excluded_users if, for exclusion i:
 *  - There exists at least one (from_ts, to_ts) conversion window attempt
 *    that is "tainted" by an exclusion event (excl_ts in (from_ts, to_ts))
 *  - AND there does NOT exist any "clean" (from_ts, to_ts) pair without an
 *    exclusion event in between
 *
 * @param anchorFilter - When true, restricts (f, t) pairs to only those where
 *   f is within [first_step_ms, first_step_ms + window]. Required for unordered
 *   funnels (issue #497).
 */
function buildExcludedUsersWhereConditions(exclusions: FunnelExclusion[], anchorFilter: boolean): string {
  const win = `toInt64({window:UInt64}) * 1000`;
  const anchorGuard = anchorFilter ? `f >= first_step_ms AND f <= first_step_ms + ${win} AND ` : '';
  return exclusions.map((_, i) => {
    const tainted = [
      `arrayExists(`,
      `        f -> ${anchorGuard}arrayExists(`,
      `          t -> t > f AND t <= f + ${win} AND`,
      `               arrayExists(e -> e > f AND e < t, excl_${i}_arr),`,
      `          excl_${i}_to_arr`,
      `        ) = 1,`,
      `        excl_${i}_from_arr`,
      `      ) = 1`,
    ].join('\n      ');

    const clean = [
      `arrayExists(`,
      `        f -> ${anchorGuard}arrayExists(`,
      `          t -> t > f AND t <= f + ${win} AND`,
      `               NOT arrayExists(e -> e > f AND e < t, excl_${i}_arr),`,
      `          excl_${i}_to_arr`,
      `        ) = 1,`,
      `        excl_${i}_from_arr`,
      `      ) = 0`,
    ].join('\n      ');

    return `(${tainted}\n      AND ${clean})`;
  }).join('\n      OR ');
}

/** Builds the excluded_users CTE as a QueryNode (AST). */
export function buildExcludedUsersCTE(exclusions: FunnelExclusion[], anchorFilter = false): SelectNode {
  return select(col('person_id'))
    .from('funnel_per_user')
    .where(raw(buildExcludedUsersWhereConditions(exclusions, anchorFilter)))
    .build();
}

/**
 * Extracts alias names from an array of Expr nodes (typically exclusion columns).
 * Each node is expected to be an AliasExpr with a string alias field.
 */
export function extractExclColumnAliases(exprs: Expr[]): string[] {
  return exprs
    .map(e => (e as { type: string; alias?: string }).type === 'alias' ? (e as { alias: string }).alias : undefined)
    .filter((a): a is string => !!a);
}

// ── Unordered coverage expressions ───────────────────────────────────────────

/**
 * Builds the three unordered coverage expressions that are shared between
 * funnel-unordered.sql.ts and funnel-time-to-convert.ts (unordered path).
 *
 * @param N           Total number of steps.
 * @param winExpr     ClickHouse expression for the window in milliseconds (e.g. `toInt64({window:UInt64}) * 1000`).
 * @param stepsOrConds Array of length N used only for .map index iteration.
 * @returns coverageExpr, maxStepExpr, anchorMsExpr
 */
export function buildUnorderedCoverageExprs(
  N: number,
  winExpr: string,
  stepsOrConds: readonly unknown[],
): {
  /** Closure returning the coverage sum expression for a given anchor variable. */
  coverageExpr: (anchorVar: string) => string;
  /** Expression for max achievable step from any candidate anchor. */
  maxStepExpr: string;
  /** Expression for the anchor millisecond timestamp. */
  anchorMsExpr: string;
} {
  const coverageExpr = (anchorVar: string): string =>
    stepsOrConds.map((_, j) =>
      `if(arrayExists(t${j} -> t${j} >= ${anchorVar} AND t${j} <= ${anchorVar} + ${winExpr}, t${j}_arr), 1, 0)`,
    ).join(' + ');

  const maxFromEachStep = stepsOrConds.map((_, i) =>
    `arrayMax(a${i} -> toInt64(${coverageExpr(`a${i}`)}), t${i}_arr)`,
  );
  const maxStepExpr = maxFromEachStep.length === 1
    ? maxFromEachStep[0]
    : `greatest(${maxFromEachStep.join(', ')})`;

  let anchorMsExpr: string;
  if (N === 1) {
    anchorMsExpr = `if(length(t0_arr) > 0, arrayMin(t0_arr), toInt64(0))`;
  } else {
    const fullCovPred = (i: number): string =>
      `a${i} -> (${coverageExpr(`a${i}`)}) = ${N}`;
    const maxes = stepsOrConds.map((_, i) =>
      `arrayMax(arrayFilter(${fullCovPred(i)}, t${i}_arr))`,
    );
    let expr = `toInt64(0)`;
    for (let i = maxes.length - 1; i >= 0; i--) {
      expr = `if(toInt64(${maxes[i]}) != 0, toInt64(${maxes[i]}), ${expr})`;
    }
    anchorMsExpr = expr;
  }

  return { coverageExpr, maxStepExpr, anchorMsExpr };
}

/**
 * AST version of buildUnorderedCoverageExprs.
 *
 * Returns Expr AST nodes for max_step and anchor_ms, eliminating the need
 * for raw() wrappers. Used by funnel-unordered.sql.ts (pure AST path).
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
      gt(func('length', col('t0_arr')), literal(0)),
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
export function avgTimeSecondsExpr(): Expr {
  return avgIf(
    raw('(last_step_ms - first_step_ms) / 1000.0'),
    and(
      gte(col('max_step'), raw('{num_steps:UInt64}')),
      gt(col('first_step_ms'), literal(0)),
      gt(col('last_step_ms'), col('first_step_ms')),
    ),
  ).as('avg_time_seconds');
}

/**
 * Builds the CROSS JOIN subquery for step numbers: SELECT number + 1 AS step_num FROM numbers(N).
 * Shared between funnel-query.ts and funnel-cohort-breakdown.ts.
 */
export function stepsSubquery(): SelectNode {
  return select(
    add(col('number'), literal(1)).as('step_num'),
  )
    .from('numbers({num_steps:UInt64})')
    .build();
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

// ── Base query params builder ────────────────────────────────────────────────

export function buildBaseQueryParams(
  params: {
    project_id: string;
    date_from: string;
    date_to: string;
    timezone?: string;
    conversion_window_days: number;
    conversion_window_value?: number;
    conversion_window_unit?: string;
    steps: FunnelStep[];
  },
  allEventNames: string[],
): FunnelChQueryParams {
  const windowSeconds = resolveWindowSeconds(params);
  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
  const queryParams: FunnelChQueryParams = {
    project_id: params.project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    num_steps: params.steps.length,
    all_event_names: allEventNames,
  };
  if (hasTz) {queryParams.tz = params.timezone;}
  // Step event name params are no longer injected here — buildStepCondition()
  // uses namedParam() to embed them directly in the AST.
  return queryParams;
}

