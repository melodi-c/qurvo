import type { Expr } from '@qurvo/ch-query';
import {
  and,
  col,
  eq,
  inArray,
  jsonExtractRaw,
  jsonExtractString,
  jsonHas,
  literal,
  param,
  toFloat64OrZero,
} from '@qurvo/ch-query';
import {
  applyOperator,
  buildCohortFilterClause,
  DIRECT_COLUMNS,
  parsePropertyPath,
} from '@qurvo/cohort-query';
import type { CohortFilterInput, PropertySource } from '@qurvo/cohort-query';
import { timeRange, toChTs } from './time';

// Types

export type FilterOperator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains'
  | 'is_set' | 'is_not_set'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'regex' | 'not_regex'
  | 'in' | 'not_in'
  | 'between' | 'not_between'
  | 'is_date_before' | 'is_date_after' | 'is_date_exact'
  | 'contains_multi' | 'not_contains_multi';

export interface PropertyFilter {
  property: string;
  operator: FilterOperator;
  value?: string;
  /** Multiple values for operators: in, not_in, between, not_between, contains_multi, not_contains_multi */
  values?: string[];
}

// Re-export DIRECT_COLUMNS from cohort-query for consumers that import from here
export { DIRECT_COLUMNS } from '@qurvo/cohort-query';

// Public API

/** project_id = {p_N:UUID} */
export function projectIs(projectId: string): Expr {
  return eq(col('project_id'), param('UUID', projectId));
}

/** event_name = {p_N:String} */
export function eventIs(eventName: string): Expr {
  return eq(col('event_name'), param('String', eventName));
}

/** event_name IN ({p_N:Array(String)}) */
export function eventIn(eventNames: string[]): Expr {
  return inArray(col('event_name'), param('Array(String)', eventNames));
}

/**
 * Resolves a property name to its typed Expr for event-level extraction.
 * Returns col('name') for direct columns, or jsonExtractString(col(jsonColumn), ...keys) for JSON.
 */
export function resolvePropertyExpr(prop: string): Expr {
  const source = parsePropertyPath(prop);
  if (source) {
    return jsonExtractString(col(source.jsonColumn), ...source.segments);
  }
  if (DIRECT_COLUMNS.has(prop)) {
    return col(prop);
  }
  throw new Error(`Unknown filter property: ${prop}`);
}

/**
 * Resolves a numeric property to its typed float extraction expression.
 * toFloat64OrZero(jsonExtractRaw(col(jsonColumn), ...keys))
 */
export function resolveNumericPropertyExpr(prop: string): Expr {
  const source = parsePropertyPath(prop);
  if (source) {
    return toFloat64OrZero(jsonExtractRaw(col(source.jsonColumn), ...source.segments));
  }
  throw new Error(`Unknown metric property: ${prop}`);
}

/**
 * Monotonic counter for unique named-param keys.
 *
 * `applyOperator()` embeds filter values via `namedParam(pk, ...)` — if two calls
 * share the same `pk` but different values, the compiler's `mergeParams()` overwrites
 * the first value. A per-call counter suffix guarantees uniqueness even when the same
 * property+operator pair appears in multiple series arms of a UNION ALL.
 */
let _pfCounter = 0;

/**
 * Single property filter -> Expr.
 *
 * Delegates to the shared `applyOperator()` from `@qurvo/cohort-query`.
 * Each call gets a unique param key to avoid collisions when the same
 * property+operator appears in different series with different values.
 */
export function propertyFilter(filter: PropertyFilter): Expr {
  const params: Record<string, unknown> = {};
  const pk = `pf_${filter.property.replace(/[^a-zA-Z0-9_]/g, '_')}_${filter.operator}_${_pfCounter++}`;
  const colExpr = resolvePropertyExpr(filter.property);
  return applyOperator(colExpr, filter.operator, pk, params, filter.value, filter.values);
}

/**
 * Array of property filters -> AND(filter1, filter2, ...).
 * Returns undefined for empty arrays (allowing and() to skip it).
 */
export function propertyFilters(filters: PropertyFilter[]): Expr | undefined {
  if (filters.length === 0) {return undefined;}
  return and(...filters.map(propertyFilter));
}

/**
 * Cohort filter: RESOLVED_PERSON IN (subquery).
 *
 * Delegates to `@qurvo/cohort-query`'s `buildCohortFilterClause()` which returns
 * an Expr tree with named params embedded via `namedParam()`. The returned Expr
 * flows through the AST compilation pipeline naturally — no compile→rawWithParams
 * workaround needed.
 *
 * Returns undefined if inputs is empty/undefined (allowing and() to skip it).
 */
export function cohortFilter(
  inputs: CohortFilterInput[] | undefined,
  projectId: string,
  dateTo?: string,
  dateFrom?: string,
): Expr | undefined {
  if (!inputs?.length) {return undefined;}

  // Collect params populated by buildCohortFilterClause into a local object.
  const cohortParams: Record<string, unknown> = {};
  cohortParams['project_id'] = projectId;

  const expr = buildCohortFilterClause(
    inputs,
    'project_id',
    cohortParams,
    undefined,
    dateTo,
    dateFrom,
  );
  return expr ?? undefined;
}

/**
 * Unified base WHERE clause for analytics queries.
 *
 * Replaces the 6x duplicated pattern:
 *   project_id = ... AND timestamp >= ... AND timestamp <= ...
 *   [AND event_name = ...]
 *   [AND propertyFilter1 AND propertyFilter2 ...]
 *   [AND cohortClause]
 *
 * Returns: and(projectIs, timeRange, eventIs?, propertyFilters?, cohortFilter?)
 *
 * Cohort params are embedded in the AST via NamedParamExpr and flow through
 * compile() automatically -- no external queryParams object needed.
 */
export function analyticsWhere(opts: {
  projectId: string;
  from: string;
  to: string;
  tz: string;
  eventName?: string;
  eventNames?: string[];
  filters?: PropertyFilter[];
  cohortFilters?: CohortFilterInput[];
  dateTo?: string;
  dateFrom?: string;
}): Expr {
  return and(
    projectIs(opts.projectId),
    timeRange(opts.from, opts.to, opts.tz),
    opts.eventName ? eventIs(opts.eventName) : undefined,
    opts.eventNames?.length ? eventIn(opts.eventNames) : undefined,
    opts.filters?.length ? propertyFilters(opts.filters) : undefined,
    opts.cohortFilters?.length
      ? cohortFilter(opts.cohortFilters, opts.projectId, opts.dateTo, opts.dateFrom)
      : undefined,
  );
}

/**
 * Returns the (dateTo, dateFrom) pair formatted for cohort filter calls.
 * Eliminates the `toChTs(params.date_to, true), toChTs(params.date_from)` pattern
 * that repeats 6+ times across analytics queries.
 */
export function cohortBounds(params: { date_to: string; date_from: string }): { dateTo: string; dateFrom: string } {
  return { dateTo: toChTs(params.date_to, true), dateFrom: toChTs(params.date_from) };
}

export { resolvedPerson } from '@qurvo/cohort-query';
