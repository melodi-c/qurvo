import type { CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';

// ── Shared breakdown types ──────────────────────────────────────────────────

/**
 * Common breakdown-related query parameters shared across analytics modules
 * (trend, funnel, etc.). Each module extends this with its own specific fields.
 */
export interface BreakdownQueryParams {
  breakdown_property?: string;
  breakdown_cohort_ids?: CohortBreakdownEntry[];
}

/**
 * Common shape for breakdown metadata in query results.
 * Analytics result types extend this with module-specific fields.
 */
export interface BreakdownResultBase {
  breakdown: boolean;
  breakdown_property?: string;
}

// ── Shared breakdown utilities ──────────────────────────────────────────────

/**
 * Normalizes a raw breakdown_value from ClickHouse into a display-ready string.
 *
 * Replaces null / undefined / empty string with `'(none)'` — the canonical
 * placeholder for missing breakdown values used across trend and funnel modules.
 */
export function normalizeBreakdownValue(v: string | null | undefined): string {
  return (v !== null && v !== undefined && v !== '') ? v : '(none)';
}
