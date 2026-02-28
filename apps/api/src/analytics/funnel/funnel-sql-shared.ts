import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import {
  rawWithParams,
  raw,
  select,
  col,
  compileExprToSql,
  CompilerContext,
  avgIf,
  and,
  gte,
  gt,
  literal,
  add,
  type Expr,
  type SelectNode,
} from '@qurvo/ch-query';
import { toChTs, RESOLVED_PERSON, propertyFilters } from '../query-helpers';
import type { FunnelStep, FunnelExclusion, FunnelOrderType } from './funnel.types';

export { RESOLVED_PERSON, toChTs, CompilerContext };

// ── ClickHouse query parameter types ─────────────────────────────────────────

/**
 * Static base parameters shared by all funnel queries.
 * Dynamic per-step and per-filter keys are captured by the index signature.
 *
 * Static keys:
 *   project_id     — UUID of the project
 *   from           — start of the date range (ClickHouse DateTime string)
 *   to             — end of the date range (ClickHouse DateTime string)
 *   window         — conversion window in seconds (UInt64)
 *   num_steps      — total number of funnel steps (UInt64)
 *   all_event_names — all event names across steps and exclusions (Array(String))
 *
 * Dynamic keys added by other builders:
 *   step_{i}             — primary event name for step i (String)
 *   step_{i}_names       — all event names for step i when using OR-logic (Array(String))
 *   step_{i}_{prefix}_f{j}_v — filter value for step i, filter j
 *   excl_{i}_name             — exclusion event name (String)
 *   excl_{i}_from_step_name   — from-step event name for exclusion i, single-event steps (String)
 *   excl_{i}_from_step_names  — from-step event names for exclusion i, OR-logic steps (Array(String))
 *   excl_{i}_to_step_name     — to-step event name for exclusion i, single-event steps (String)
 *   excl_{i}_to_step_names    — to-step event names for exclusion i, OR-logic steps (Array(String))
 *   sample_pct           — sampling percentage 0-100 (UInt8), present only when sampling
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
 * Returns the SQL expression to compare `timestamp` against the {from} or {to} parameter.
 * When the query params include a `tz` value, wraps the string param with toDateTime64(..., tz).
 */
export function funnelTsExpr(paramName: 'from' | 'to', queryParams: FunnelChQueryParams): string {
  const hasTz = !!queryParams.tz;
  return hasTz
    ? `toDateTime64({${paramName}:String}, 3, {tz:String})`
    : `{${paramName}:DateTime64(3)}`;
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

/** Builds the windowFunnel condition for one step, injecting filter params into queryParams.
 *
 * An optional `ctx` (CompilerContext) can be passed to share the param counter across
 * multiple buildStepCondition / buildExclusionColumns calls for the same query —
 * prevents p_0 collisions when each call would otherwise start its own counter.
 */
export function buildStepCondition(
  step: FunnelStep,
  idx: number,
  queryParams: FunnelChQueryParams,
  ctx?: CompilerContext,
): string {
  const names = resolveStepEventNames(step);
  const eventCond = names.length === 1
    ? `event_name = {step_${idx}:String}`
    : `event_name IN ({step_${idx}_names:Array(String)})`;

  const filtersExpr = propertyFilters(step.filters ?? []);
  if (!filtersExpr) {return eventCond;}

  const { sql: filterSql } = compileExprToSql(filtersExpr, queryParams, ctx);
  return `${eventCond} AND ${filterSql}`;
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

/**
 * Returns the raw SQL string for sampling clause, for use in raw CTE body strings.
 * Returns '' when sampling is inactive, or the AND clause when active.
 * This is the "escape hatch" version for complex CTE bodies that are built as raw strings.
 */
export function buildSamplingClauseRaw(
  samplingFactor: number | undefined,
  queryParams: FunnelChQueryParams,
): string {
  if (samplingFactor === null || samplingFactor === undefined || isNaN(samplingFactor) || samplingFactor >= 1) {return '';}
  const pct = Math.round(samplingFactor * 100);
  queryParams.sample_pct = pct;
  return `\n                AND sipHash64(toString(${RESOLVED_PERSON})) % 100 < {sample_pct:UInt8}`;
}

// ── windowFunnel expression ──────────────────────────────────────────────────

export function buildWindowFunnelExpr(orderType: FunnelOrderType, stepConditions: string): string {
  if (orderType === 'strict') {
    return `windowFunnel({window:UInt64} * 1000, 'strict_order')(toUInt64(toUnixTimestamp64Milli(timestamp)), ${stepConditions})`;
  }
  return `windowFunnel({window:UInt64} * 1000)(toUInt64(toUnixTimestamp64Milli(timestamp)), ${stepConditions})`;
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
 * Builds per-user array columns for exclusion checking.
 *
 * An optional `ctx` (CompilerContext) can be passed to share the param counter across
 * multiple buildStepCondition / buildExclusionColumns calls for the same query.
 */
export function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
  queryParams: FunnelChQueryParams,
  ctx?: CompilerContext,
): string[] {
  const lines: string[] = [];
  for (const [i, excl] of exclusions.entries()) {
    queryParams[`excl_${i}_name`] = excl.event_name;

    const fromNames = resolveStepEventNames(steps[excl.funnel_from_step]);
    const toNames = resolveStepEventNames(steps[excl.funnel_to_step]);

    let fromCond: string;
    if (fromNames.length === 1) {
      queryParams[`excl_${i}_from_step_name`] = fromNames[0];
      fromCond = `event_name = {excl_${i}_from_step_name:String}`;
    } else {
      queryParams[`excl_${i}_from_step_names`] = fromNames;
      fromCond = `event_name IN ({excl_${i}_from_step_names:Array(String)})`;
    }

    let toCond: string;
    if (toNames.length === 1) {
      queryParams[`excl_${i}_to_step_name`] = toNames[0];
      toCond = `event_name = {excl_${i}_to_step_name:String}`;
    } else {
      queryParams[`excl_${i}_to_step_names`] = toNames;
      toCond = `event_name IN ({excl_${i}_to_step_names:Array(String)})`;
    }

    const exclFiltersExpr = propertyFilters(excl.filters ?? []);
    let exclCond = `event_name = {excl_${i}_name:String}`;
    if (exclFiltersExpr) {
      const { sql: exclFilterSql } = compileExprToSql(exclFiltersExpr, queryParams, ctx);
      exclCond += ` AND ${exclFilterSql}`;
    }

    lines.push(
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${fromCond}) AS excl_${i}_from_arr`,
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${toCond}) AS excl_${i}_to_arr`,
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${exclCond}) AS excl_${i}_arr`,
    );
  }
  return lines;
}

/**
 * Builds the excluded_users WHERE condition SQL string.
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
 * Returns the excluded_users CTE body as a raw SQL string.
 * Used by funnel-time-to-convert.ts where the entire query is built as raw SQL.
 * Delegates to the shared buildExcludedUsersWhereConditions.
 */
export function buildExcludedUsersCTERaw(exclusions: FunnelExclusion[], anchorFilter = false): string {
  return `excluded_users AS (
    SELECT person_id
    FROM funnel_per_user
    WHERE ${buildExcludedUsersWhereConditions(exclusions, anchorFilter)}
  )`;
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

// ── Strict user filter ──────────────────────────────────────────────────────

/**
 * Builds the strict-mode user pre-filter subquery.
 * Duplicated in funnel-ordered.sql.ts and funnel-time-to-convert.ts.
 *
 * For strict mode: returns a distinct_id IN subquery that limits to users with at least one step event.
 * For non-strict: returns a simple AND event_name IN clause.
 */
export function buildStrictUserFilter(
  fromExpr: string,
  toExpr: string,
  paramName: string,
  orderType: FunnelOrderType,
): string {
  if (orderType === 'strict') {
    return [
      '',
      '                AND distinct_id IN (',
      '                  SELECT DISTINCT distinct_id',
      '                  FROM events',
      '                  WHERE project_id = {project_id:UUID}',
      `                    AND timestamp >= ${fromExpr}`,
      `                    AND timestamp <= ${toExpr}`,
      `                    AND event_name IN ({${paramName}:Array(String)})`,
      '                )',
    ].join('\n');
  }
  return `\n                AND event_name IN ({${paramName}:Array(String)})`;
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
export function buildEmptyStepResults(steps: FunnelStep[]): import('./funnel.types').FunnelStepResult[] {
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
  params.steps.forEach((s, i) => {
    const names = resolveStepEventNames(s);
    queryParams[`step_${i}`] = names[0];
    if (names.length > 1) {
      queryParams[`step_${i}_names`] = names;
    }
  });
  return queryParams;
}
