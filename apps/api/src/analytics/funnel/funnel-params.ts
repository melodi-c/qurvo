import {
  namedParam,
  toDateTime64,
  literal,
  type Expr,
} from '@qurvo/ch-query';
import { toChTs } from '../query-helpers';
import type { FunnelStep } from './funnel.types';
import { resolveWindowSeconds } from './funnel-window';

export { toChTs };

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
  /** IANA timezone name. Always present; UTC-optimized path uses tz !== 'UTC' check. */
  tz: string;
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
  const hasTz = queryParams.tz !== 'UTC';
  return hasTz
    ? toDateTime64(namedParam(paramName, 'String', queryParams[paramName]), literal(3), namedParam('tz', 'String', queryParams.tz))
    : namedParam(paramName, 'DateTime64(3)', queryParams[paramName]);
}

// ── Base query params builder ────────────────────────────────────────────────

export function buildBaseQueryParams(
  params: {
    project_id: string;
    date_from: string;
    date_to: string;
    timezone: string;
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
    tz: params.timezone,
    window: windowSeconds,
    num_steps: params.steps.length,
    all_event_names: allEventNames,
  };
  // Step event name params are no longer injected here — buildStepCondition()
  // uses namedParam() to embed them directly in the AST.
  return queryParams;
}
