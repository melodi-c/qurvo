import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import {
  rawWithParams,
  raw,
  select,
  col,
  compileExprToSql,
  CompilerContext,
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
  const hasValue = params.conversion_window_value != null;
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
    const multiplier = UNIT_TO_SECONDS[params.conversion_window_unit!] ?? 86400;
    const resolved = params.conversion_window_value! * multiplier;
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
  if (step.event_names?.length) return step.event_names;
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
  if (!filtersExpr) return eventCond;

  const { sql: filterSql } = compileExprToSql(filtersExpr, queryParams, ctx);
  return `${eventCond} AND ${filterSql}`;
}

/** Collects all unique event names across steps and exclusions. */
export function buildAllEventNames(steps: FunnelStep[], exclusions: FunnelExclusion[] = []): string[] {
  const names = new Set<string>();
  for (const s of steps) {
    for (const n of resolveStepEventNames(s)) names.add(n);
  }
  for (const e of exclusions) names.add(e.event_name);
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
  if (samplingFactor == null || isNaN(samplingFactor) || samplingFactor >= 1) return undefined;
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
  if (samplingFactor == null || isNaN(samplingFactor) || samplingFactor >= 1) return '';
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
    const namesA = new Set(resolveStepEventNames(steps[i]!));
    for (let j = i + 1; j < steps.length; j++) {
      const namesB = resolveStepEventNames(steps[j]!);
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

    const fromNames = resolveStepEventNames(steps[excl.funnel_from_step]!);
    const toNames = resolveStepEventNames(steps[excl.funnel_to_step]!);

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
 * Builds the excluded_users CTE as a QueryNode.
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
export function buildExcludedUsersCTE(exclusions: FunnelExclusion[], anchorFilter = false): SelectNode {
  const win = `toInt64({window:UInt64}) * 1000`;
  const anchorGuard = anchorFilter ? `f >= first_step_ms AND f <= first_step_ms + ${win} AND ` : '';
  const conditions = exclusions.map((_, i) => {
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
  });

  return select(col('person_id'))
    .from('funnel_per_user')
    .where(raw(conditions.join('\n      OR ')))
    .build();
}

/**
 * Returns the excluded_users CTE body as a raw SQL string.
 * Used by funnel-time-to-convert.ts where the entire query is built as raw SQL.
 * Same logic as buildExcludedUsersCTE but returns string instead of SelectNode.
 */
export function buildExcludedUsersCTERaw(exclusions: FunnelExclusion[], anchorFilter = false): string {
  const win = `toInt64({window:UInt64}) * 1000`;
  const anchorGuard = anchorFilter ? `f >= first_step_ms AND f <= first_step_ms + ${win} AND ` : '';
  const conditions = exclusions.map((_, i) => {
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
  });

  return `excluded_users AS (
    SELECT person_id
    FROM funnel_per_user
    WHERE ${conditions.join('\n      OR ')}
  )`;
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
  if (hasTz) queryParams.tz = params.timezone;
  params.steps.forEach((s, i) => {
    const names = resolveStepEventNames(s);
    queryParams[`step_${i}`] = names[0];
    if (names.length > 1) {
      queryParams[`step_${i}_names`] = names;
    }
  });
  return queryParams;
}
