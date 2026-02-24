import { BadRequestException } from '@nestjs/common';
import { toChTs, RESOLVED_PERSON } from '../../utils/clickhouse-helpers';
import { buildPropertyFilterConditions } from '../../utils/property-filter';
import type { FunnelStep, FunnelExclusion, FunnelOrderType } from './funnel.types';

export { RESOLVED_PERSON };

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
  queryParams: Record<string, unknown>,
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
  queryParams: Record<string, unknown>,
): string {
  if (!samplingFactor || samplingFactor >= 1) return '';
  const pct = Math.round(samplingFactor * 100);
  queryParams.sample_pct = pct;
  return '\n                AND sipHash64(distinct_id) % 100 < {sample_pct:UInt8}';
}

// ── windowFunnel expression ──────────────────────────────────────────────────

export function buildWindowFunnelExpr(orderType: FunnelOrderType, stepConditions: string): string {
  if (orderType === 'strict') {
    return `windowFunnel({window:UInt64}, 'strict_order')(toDateTime(timestamp), ${stepConditions})`;
  }
  return `windowFunnel({window:UInt64})(toDateTime(timestamp), ${stepConditions})`;
}

// ── Exclusion helpers ────────────────────────────────────────────────────────

export function validateExclusions(exclusions: FunnelExclusion[], numSteps: number): void {
  for (const excl of exclusions) {
    if (excl.funnel_from_step >= excl.funnel_to_step) {
      throw new BadRequestException(
        `Exclusion "${excl.event_name}": funnel_from_step must be < funnel_to_step`,
      );
    }
    if (excl.funnel_to_step >= numSteps) {
      throw new BadRequestException(
        `Exclusion "${excl.event_name}": funnel_to_step ${excl.funnel_to_step} out of range (max ${numSteps - 1})`,
      );
    }
  }
}

export function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
  queryParams: Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  for (const [i, excl] of exclusions.entries()) {
    queryParams[`excl_${i}_name`] = excl.event_name;
    queryParams[`excl_${i}_from_step_name`] = steps[excl.funnel_from_step]!.event_name;
    queryParams[`excl_${i}_to_step_name`] = steps[excl.funnel_to_step]!.event_name;

    lines.push(
      `minIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_name:String}) AS excl_${i}_ts`,
      `maxIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_from_step_name:String}) AS excl_${i}_from_ts`,
      `minIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_to_step_name:String}) AS excl_${i}_to_ts`,
    );
  }
  return lines;
}

export function buildExcludedUsersCTE(exclusions: FunnelExclusion[]): string {
  const conditions = exclusions.map(
    (_, i) =>
      `(excl_${i}_ts > 0 AND excl_${i}_from_ts > 0 AND excl_${i}_to_ts > 0 ` +
      `AND excl_${i}_ts > excl_${i}_from_ts AND excl_${i}_to_ts > excl_${i}_ts)`,
  );
  return `excluded_users AS (
    SELECT person_id
    FROM funnel_per_user
    WHERE ${conditions.join('\n      OR ')}
  )`;
}

// ── Base query params builder ────────────────────────────────────────────────

/**
 * Populates the base ClickHouse query params shared by all funnel paths.
 * Returns a fresh mutable Record that callers can extend.
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
): Record<string, unknown> {
  const windowSeconds = resolveWindowSeconds(params);
  const queryParams: Record<string, unknown> = {
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
