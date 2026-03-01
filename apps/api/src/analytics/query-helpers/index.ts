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
  // String-returning helpers for raw SQL consumers
  granularityTruncExpr,
  granularityTruncMinExpr,
  granularityInterval,
  granularityNeighborExpr,
  tsExpr,
  buildFilterClause,
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
  resolvePropertyExprStr,
  resolveNumericPropertyExpr,
  resolveNumericPropertyExprStr,
  DIRECT_COLUMNS,
  // String-returning helpers for raw SQL consumers
  buildPropertyFilterConditions,
  buildCohortClause,
} from './filters';
export type {
  FilterOperator,
  PropertyFilter,
  CohortFilterInputLike,
} from './filters';

// Resolved person
export { resolvedPerson, RESOLVED_PERSON } from './resolved-person';

// Aggregations
export {
  baseMetricColumns,
  aggColumn,
  numericProperty,
} from './aggregations';
export type { TrendMetric } from './aggregations';

// Breakdown
export { normalizeBreakdownValue } from './breakdown';
export type { BreakdownQueryParams, BreakdownResultBase } from './breakdown';
