// Time expressions
export {
  toChTs,
  shiftDate,
  shiftPeriod,
  truncateDate,
  tsParam,
  timeRange,
  bucket,
  neighborBucket,
  bucketOfMin,
  resolveRelativeDate,
  isRelativeDate,
} from './time';
export type { Granularity } from './time';

// Filters
export {
  projectIs,
  eventIs,
  eventIn,
  propertyFilter,
  propertyFilters,
  cohortFilter,
  cohortBounds,
  analyticsWhere,
  resolvePropertyExpr,
  resolveNumericPropertyExpr,
  DIRECT_COLUMNS,
} from './filters';
export type {
  FilterOperator,
  PropertyFilter,
} from './filters';
export type { CohortFilterInput } from '@qurvo/cohort-query';

// Resolved person — re-exported from @qurvo/cohort-query (single source of truth)
export { resolvedPerson, RESOLVED_PERSON } from '@qurvo/cohort-query';

// Aggregations
export {
  baseMetricColumns,
  aggColumn,
  numericProperty,
} from './aggregations';
export type { TrendMetric } from './aggregations';

// ── Shared breakdown helpers ─────────────────────────────────────────────────

/**
 * Normalizes a breakdown value, replacing null/undefined/empty with '(none)'.
 * Single source of truth for the pattern used across trend.query.ts, funnel-results.ts, etc.
 */
export function normalizeBreakdownValue(value: string | null | undefined): string {
  return (value !== null && value !== undefined && value !== '') ? value : '(none)';
}
