import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { toChTs, RESOLVED_PERSON, tsExpr } from '../../utils/clickhouse-helpers';
import { buildPropertyFilterConditions } from '../../utils/property-filter';
import type { FunnelStep, FunnelExclusion, FunnelOrderType } from './funnel.types';

export { tsExpr };

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
  return tsExpr(paramName, 'tz', !!queryParams.tz);
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

const CONVERSION_WINDOW_DAYS_DEFAULT = 14;

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
    // conversion_window_value/unit takes precedence over conversion_window_days.
    // conversion_window_days is a required field (non-optional in FunnelQueryParams),
    // so callers always provide it — even when they intend to use value/unit.
    // We only reject if the caller explicitly set conversion_window_days to a
    // non-default value that would also produce a different window than value/unit,
    // but in practice this is not actionable: value/unit is the more specific intent.
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

/**
 * WHERE-based sampling: deterministic per person_id (after identity merge), no SAMPLE BY needed.
 *
 * Sampling is applied on `RESOLVED_PERSON` (person_id) so that users with multiple
 * distinct_ids (e.g. anonymous pre-login + identified post-login) are either entirely
 * included or entirely excluded. Using `distinct_id` here would split a merged user:
 * some of their events would pass the hash check while others would not, causing
 * partial event sets per person and systematically underreporting conversion on later steps.
 *
 * Guard: returns '' (no sampling) when samplingFactor is null, undefined, NaN, or >= 1.
 * Previously `!samplingFactor` returned true for 0, silently treating it as "no sampling".
 */
export function buildSamplingClause(
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
  // Use toUnixTimestamp64Milli(timestamp) (UInt64, milliseconds) instead of toDateTime(timestamp)
  // (which truncates to second precision). windowFunnel supports UInt64 since ClickHouse 19.8.
  // {window:UInt64} is in seconds; multiply by 1000 to get the window in milliseconds.
  if (orderType === 'strict') {
    return `windowFunnel({window:UInt64} * 1000, 'strict_order')(toUInt64(toUnixTimestamp64Milli(timestamp)), ${stepConditions})`;
  }
  return `windowFunnel({window:UInt64} * 1000)(toUInt64(toUnixTimestamp64Milli(timestamp)), ${stepConditions})`;
}

// ── Unordered funnel validation ───────────────────────────────────────────────

/**
 * Validates that no two steps in an unordered funnel share any event name.
 *
 * In unordered funnels each step is computed via `minIf(timestamp, stepCondition)`.
 * When two steps share an event name, both receive the same earliest timestamp for
 * that event — causing a single occurrence to satisfy both steps simultaneously and
 * inflating the conversion count.
 *
 * This check applies to the full resolved set of event names per step (i.e. it
 * respects OR-logic steps that carry multiple names in `event_names`).
 */
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
    // Reject exclusions that share an event_name with a funnel step but have no
    // property filters to distinguish them. Without filters the exclusion will collect
    // timestamps from step events and falsely exclude users who completed the step.
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
 * Uses groupArrayIf to collect timestamps of the from-step, to-step, and exclusion event
 * per person. These arrays are used by buildExcludedUsersCTE to perform per-window
 * exclusion checks: a user is excluded only when ALL their valid conversion window attempts
 * contain an exclusion event. This prevents false positives (exclusion in a different
 * session) and false negatives (user re-enters the funnel after an exclusion).
 *
 * Supports OR-logic steps: when a funnel step has multiple event_names, uses
 * `event_name IN ({param:Array(String)})` instead of `event_name = {param:String}`
 * so that users who entered via an alternative OR-event are correctly identified
 * as anchor participants and subjected to exclusion filtering.
 */
export function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
  queryParams: FunnelChQueryParams,
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

    // Build the exclusion event condition: event_name match + optional property filters.
    // Using a dedicated prefix "excl_{i}_excl" to avoid collision with from/to-step params.
    const exclFilterParts = buildPropertyFilterConditions(
      excl.filters ?? [],
      `excl_${i}_excl`,
      queryParams,
    );
    const exclCond = [`event_name = {excl_${i}_name:String}`, ...exclFilterParts].join(' AND ');

    lines.push(
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${fromCond}) AS excl_${i}_from_arr`,
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${toCond}) AS excl_${i}_to_arr`,
      `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${exclCond}) AS excl_${i}_arr`,
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
 *
 * @param exclusions - Exclusion definitions from the funnel query
 * @param anchorFilter - When true, restricts (f, t) pairs to only those where
 *   f is within [first_step_ms, first_step_ms + window]. Required for unordered
 *   funnels to isolate the exclusion check to the specific anchor window that was
 *   counted as the conversion. Without this, sessions outside the anchor window
 *   (either before or after) can create false clean-path evidence that masks
 *   tainted conversions within the anchor window — see issue #497.
 *   For ordered funnels, this parameter should be false (the re-entry semantics
 *   handle window isolation naturally via step-sequence ordering).
 */
export function buildExcludedUsersCTE(exclusions: FunnelExclusion[], anchorFilter = false): string {
  const win = `toInt64({window:UInt64}) * 1000`;
  // In unordered mode, restrict from-step timestamps to the anchor window
  // [first_step_ms, first_step_ms + WIN] so that only pairs within the anchor
  // window are checked. Sessions before the anchor (historical clean sessions)
  // cannot mask tainted conversions within the anchor window.
  const anchorGuard = anchorFilter ? `f >= first_step_ms AND f <= first_step_ms + ${win} AND ` : '';
  const conditions = exclusions.map((_, i) => {
    // tainted_path: exists (f, t) pair within window with exclusion e in (f, t)
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

    // clean_path: exists (f, t) pair within window with NO exclusion in (f, t)
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

/**
 * Builds and returns the base ClickHouse query params shared by all funnel paths.
 * Returns a typed FunnelChQueryParams that callers can extend with dynamic keys.
 *
 * When `params.timezone` is provided and is not 'UTC', the `tz` field is set in
 * the returned params so that `funnelTsExpr()` generates timezone-aware expressions
 * (e.g. `toDateTime64({from:String}, 3, {tz:String})` instead of `{from:DateTime64(3)}`).
 */
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
    from: toChTs(params.date_from, false, params.timezone),
    to: toChTs(params.date_to, true, params.timezone),
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
