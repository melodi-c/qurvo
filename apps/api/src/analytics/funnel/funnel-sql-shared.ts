import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { toChTs, RESOLVED_PERSON } from '../../utils/clickhouse-helpers';
import { buildPropertyFilterConditions } from '../../utils/property-filter';
import type { FunnelStep, FunnelExclusion, FunnelOrderType } from './funnel.types';

export { RESOLVED_PERSON };

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
 *   excl_{i}_name        — exclusion event name (String)
 *   excl_{i}_from_step_name — from-step event name for exclusion i (String)
 *   excl_{i}_to_step_name   — to-step event name for exclusion i (String)
 *   sample_pct           — sampling percentage 0-100 (UInt8), present only when sampling
 */
export interface FunnelChQueryParams {
  project_id: string;
  from: string;
  to: string;
  window: number;
  num_steps: number;
  all_event_names: string[];
  [key: string]: unknown;
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
  if (params.conversion_window_value != null && params.conversion_window_unit) {
    const multiplier = UNIT_TO_SECONDS[params.conversion_window_unit] ?? 86400;
    return params.conversion_window_value * multiplier;
  }
  return params.conversion_window_days * 86400;
}

// ── Step helpers ─────────────────────────────────────────────────────────────

/** Returns all event names for a step (supports OR-logic via event_names). */
export function resolveStepEventNames(step: FunnelStep): string[] {
  if (step.event_names?.length) return step.event_names;
  return [step.event_name];
}

/** Builds the windowFunnel condition for one step, injecting filter params into queryParams. */
export function buildStepCondition(
  step: FunnelStep,
  idx: number,
  queryParams: FunnelChQueryParams,
): string {
  const filterParts = buildPropertyFilterConditions(
    step.filters ?? [],
    `step_${idx}`,
    queryParams,
  );
  const names = resolveStepEventNames(step);
  const eventCond = names.length === 1
    ? `event_name = {step_${idx}:String}`
    : `event_name IN ({step_${idx}_names:Array(String)})`;
  return [eventCond, ...filterParts].join(' AND ');
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

/** WHERE-based sampling: deterministic per distinct_id, no SAMPLE BY needed on table. */
export function buildSamplingClause(
  samplingFactor: number | undefined,
  queryParams: FunnelChQueryParams,
): string {
  if (!samplingFactor || samplingFactor >= 1) return '';
  const pct = Math.round(samplingFactor * 100);
  queryParams.sample_pct = pct;
  return '\n                AND sipHash64(distinct_id) % 100 < {sample_pct:UInt8}';
}

// ── windowFunnel expression ──────────────────────────────────────────────────

export function buildWindowFunnelExpr(orderType: FunnelOrderType, stepConditions: string): string {
  // Use toUnixTimestamp64Milli(timestamp) (UInt64, milliseconds) instead of toDateTime(timestamp)
  // (which truncates to second precision). windowFunnel supports UInt64 since ClickHouse 19.8.
  // {window:UInt64} is in seconds; multiply by 1000 to get the window in milliseconds.
  if (orderType === 'strict') {
    return `windowFunnel({window:UInt64} * 1000, 'strict_order')(toUInt64(toUnixTimestamp64Milli(timestamp)), ${stepConditions})`;
  }
  return `windowFunnel({window:UInt64} * 1000)(toUInt64(toUnixTimestamp64Milli(timestamp)), ${stepConditions})`;
}

// ── Exclusion helpers ────────────────────────────────────────────────────────

export function validateExclusions(exclusions: FunnelExclusion[], numSteps: number): void {
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
  }
}

/**
 * Builds per-user array columns for exclusion checking.
 *
 * Uses groupArrayIf to collect timestamps of the from-step, to-step, and exclusion event
 * per person. These arrays are used by buildExcludedUsersCTE to perform per-window
 * exclusion checks: a user is excluded only when ALL their valid conversion window attempts
 * contain an exclusion event. This prevents false positives (exclusion in a different
 * session) and false negatives (user re-enters the funnel after an exclusion).
 */
export function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
  queryParams: FunnelChQueryParams,
): string[] {
  const lines: string[] = [];
  for (const [i, excl] of exclusions.entries()) {
    queryParams[`excl_${i}_name`] = excl.event_name;
    queryParams[`excl_${i}_from_step_name`] = steps[excl.funnel_from_step]!.event_name;
    queryParams[`excl_${i}_to_step_name`] = steps[excl.funnel_to_step]!.event_name;

    lines.push(
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_from_step_name:String}) AS excl_${i}_from_arr`,
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_to_step_name:String}) AS excl_${i}_to_arr`,
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_name:String}) AS excl_${i}_arr`,
    );
  }
  return lines;
}

/**
 * Builds the excluded_users CTE using per-window exclusion logic.
 *
 * A user is placed in excluded_users if, for exclusion i:
 *  - There exists at least one (from_ts, to_ts) conversion window attempt
 *    that is "tainted" by an exclusion event (excl_ts in (from_ts, to_ts))
 *  - AND there does NOT exist any "clean" (from_ts, to_ts) pair without an
 *    exclusion event in between
 *
 * This means a user who re-enters the funnel after an exclusion event (e.g.
 * step1 → exclusion → step1 → step2) is NOT excluded, because the second
 * window attempt (step1 → step2) is clean.
 */
export function buildExcludedUsersCTE(exclusions: FunnelExclusion[]): string {
  const win = `toInt64({window:UInt64}) * 1000`;
  const conditions = exclusions.map((_, i) => {
    // tainted_path: exists (f, t) pair within window with exclusion e in (f, t)
    const tainted = [
      `arrayExists(`,
      `        f -> arrayExists(`,
      `          t -> t > f AND t <= f + ${win} AND`,
      `               arrayExists(e -> e > f AND e < t, excl_${i}_arr),`,
      `          excl_${i}_to_arr`,
      `        ) = 1,`,
      `        excl_${i}_from_arr`,
      `      ) = 1`,
    ].join('\n      ');

    // clean_path: exists (f, t) pair within window with NO exclusion in (f, t)
    const clean = [
      `arrayExists(`,
      `        f -> arrayExists(`,
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

/**
 * Builds and returns the base ClickHouse query params shared by all funnel paths.
 * Returns a typed FunnelChQueryParams that callers can extend with dynamic keys.
 */
export function buildBaseQueryParams(
  params: {
    project_id: string;
    date_from: string;
    date_to: string;
    conversion_window_days: number;
    conversion_window_value?: number;
    conversion_window_unit?: string;
    steps: FunnelStep[];
  },
  allEventNames: string[],
): FunnelChQueryParams {
  const windowSeconds = resolveWindowSeconds(params);
  const queryParams: FunnelChQueryParams = {
    project_id: params.project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    num_steps: params.steps.length,
    all_event_names: allEventNames,
  };
  params.steps.forEach((s, i) => {
    const names = resolveStepEventNames(s);
    queryParams[`step_${i}`] = names[0];
    if (names.length > 1) {
      queryParams[`step_${i}_names`] = names;
    }
  });
  return queryParams;
}
