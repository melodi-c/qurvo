import type { Expr } from '@qurvo/ch-query';
import {
  and,
  col,
  compileExprToSql,
  eq,
  escapeLikePattern,
  gt as chGt,
  gte as chGte,
  inArray,
  jsonExtractRaw,
  jsonExtractString,
  jsonHas,
  like,
  literal,
  lt as chLt,
  lte as chLte,
  match,
  multiSearchAny,
  neq,
  not,
  notInArray,
  notLike,
  or,
  param,
  parseDateTimeBestEffort,
  parseDateTimeBestEffortOrZero,
  raw,
  rawWithParams,
  toDate,
  toFloat64OrZero,
  toString,
} from '@qurvo/ch-query';
import {
  buildCohortFilterClause,
  DIRECT_COLUMNS,
  parsePropertyPath,
} from '@qurvo/cohort-query';
import type { CohortFilterInput, PropertySource } from '@qurvo/cohort-query';
import { timeRange, toChTs } from './time';

// ── Types ──

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

// ── Public API ──

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
 * Single property filter -> Expr.
 *
 * Converts a single property filter to an AST Expr node.
 * Values are wrapped in ParamExpr -- no mutation of external state.
 *
 * Uses typed ch-query builders (jsonExtractString, jsonExtractRaw, jsonHas)
 * instead of raw SQL string builders.
 */
export function propertyFilter(filter: PropertyFilter): Expr {
  const source = parsePropertyPath(filter.property);
  const colExpr = resolvePropertyExpr(filter.property);
  const value = filter.value ?? '';

  switch (filter.operator) {
    case 'eq':
      return buildEqFilter(colExpr, value, source);
    case 'neq':
      return buildNeqFilter(colExpr, value, source);
    case 'contains':
      return like(colExpr, param('String', `%${escapeLikePattern(value)}%`));
    case 'not_contains':
      return buildNotContainsFilter(colExpr, value, source);
    case 'is_set':
      return buildIsSetFilter(colExpr, source);
    case 'is_not_set':
      return buildIsNotSetFilter(colExpr, source);
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte':
      return buildNumericComparisonFilter(filter.operator, filter.property, source, value);
    case 'regex':
      return match(colExpr, param('String', value));
    case 'not_regex':
      return not(match(colExpr, param('String', value)));
    case 'in':
      return inArray(colExpr, param('Array(String)', filter.values ?? []));
    case 'not_in':
      return notInArray(colExpr, param('Array(String)', filter.values ?? []));
    case 'between':
    case 'not_between':
      return buildRangeFilter(filter.operator, filter.property, source, filter.values ?? []);
    case 'is_date_before':
    case 'is_date_after':
    case 'is_date_exact':
      return buildDateFilter(filter.operator, colExpr, value);
    case 'contains_multi':
      return multiSearchAny(colExpr, param('Array(String)', filter.values ?? []));
    case 'not_contains_multi':
      return not(multiSearchAny(colExpr, param('Array(String)', filter.values ?? [])));
    default: {
      const _exhaustive: never = filter.operator;
      throw new Error(`Unhandled operator: ${_exhaustive}`);
    }
  }
}

// ── Operator-specific builders (using typed ch-query functions) ──

function buildEqFilter(colExpr: Expr, value: string, source: PropertySource | null): Expr {
  const valueParam = param('String', value);
  if (source) {
    const rawExpr = toString(jsonExtractRaw(col(source.jsonColumn), ...source.segments));
    return or(eq(colExpr, valueParam), eq(rawExpr, valueParam));
  }
  return eq(colExpr, valueParam);
}

function buildNeqFilter(colExpr: Expr, value: string, source: PropertySource | null): Expr {
  const valueParam = param('String', value);
  if (source) {
    const jsonHasExpr = jsonHas(col(source.jsonColumn), ...source.segments);
    const rawExpr = toString(jsonExtractRaw(col(source.jsonColumn), ...source.segments));
    return and(jsonHasExpr, neq(colExpr, valueParam), neq(rawExpr, valueParam));
  }
  return neq(colExpr, valueParam);
}

function buildNotContainsFilter(colExpr: Expr, value: string, source: PropertySource | null): Expr {
  const likeParam = param('String', `%${escapeLikePattern(value)}%`);
  if (source) {
    const jsonHasExpr = jsonHas(col(source.jsonColumn), ...source.segments);
    return and(jsonHasExpr, notLike(colExpr, likeParam));
  }
  return notLike(colExpr, likeParam);
}

function buildIsSetFilter(colExpr: Expr, source: PropertySource | null): Expr {
  if (source) {
    return jsonHas(col(source.jsonColumn), ...source.segments);
  }
  return neq(colExpr, literal(''));
}

function buildIsNotSetFilter(colExpr: Expr, source: PropertySource | null): Expr {
  if (source) {
    return not(jsonHas(col(source.jsonColumn), ...source.segments));
  }
  return eq(colExpr, literal(''));
}

const NUMERIC_CMP_MAP = {
  gt: chGt,
  lt: chLt,
  gte: chGte,
  lte: chLte,
} as const;

function buildNumericComparisonFilter(
  op: 'gt' | 'lt' | 'gte' | 'lte',
  property: string,
  source: PropertySource | null,
  value: string,
): Expr {
  const numExpr = resolveNumericExprTyped(property, source);
  return NUMERIC_CMP_MAP[op](numExpr, param('Float64', Number(value)));
}

function buildRangeFilter(
  op: 'between' | 'not_between',
  property: string,
  source: PropertySource | null,
  vals: string[],
): Expr {
  const numExpr = resolveNumericExprTyped(property, source);
  if (op === 'between') {
    return and(
      chGte(numExpr, param('Float64', Number(vals[0] ?? 0))),
      chLte(numExpr, param('Float64', Number(vals[1] ?? 0))),
    );
  }
  return or(
    chLt(numExpr, param('Float64', Number(vals[0] ?? 0))),
    chGt(numExpr, param('Float64', Number(vals[1] ?? 0))),
  );
}

function buildDateFilter(op: 'is_date_before' | 'is_date_after' | 'is_date_exact', colExpr: Expr, value: string): Expr {
  if (!value) {return raw('1 = 0');}
  const parsed = parseDateTimeBestEffortOrZero(colExpr);
  const nonZeroGuard = neq(parsed, raw("toDateTime(0)"));

  if (op === 'is_date_before') {
    return and(nonZeroGuard, chLt(parsed, parseDateTimeBestEffort(param('String', value))));
  }
  if (op === 'is_date_after') {
    return and(nonZeroGuard, chGt(parsed, parseDateTimeBestEffort(param('String', value))));
  }
  // is_date_exact
  return and(nonZeroGuard, eq(toDate(parsed), toDate(parseDateTimeBestEffort(param('String', value)))));
}

/**
 * Resolves a numeric expression for a property using typed builders.
 * JSON properties: toFloat64OrZero(jsonExtractRaw(col(jsonColumn), ...keys))
 * Direct columns: toFloat64OrZero(col(prop))
 */
function resolveNumericExprTyped(prop: string, source: PropertySource | null): Expr {
  if (source) {
    return toFloat64OrZero(jsonExtractRaw(col(source.jsonColumn), ...source.segments));
  }
  return toFloat64OrZero(col(prop));
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
 * an Expr (ANDed IN-subquery predicates), then compiles it to SQL and wraps
 * in a `rawWithParams` so that ClickHouse named parameters (populated via
 * side effects into `cohortParams`) flow through the AST compilation pipeline.
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
  // These will be embedded into the RawWithParamsExpr and merged during compilation.
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
  if (!expr) {return undefined;}

  // Compile the Expr to SQL and wrap with rawWithParams so that ClickHouse
  // named parameters (e.g. {coh_mid_0:UUID}) are carried through the outer AST.
  const { sql, params } = compileExprToSql(expr);
  return rawWithParams(sql, { ...cohortParams, ...params });
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
 * Cohort params are embedded in the AST via RawWithParamsExpr and flow through
 * compile() automatically -- no external queryParams object needed.
 */
export function analyticsWhere(opts: {
  projectId: string;
  from: string;
  to: string;
  tz?: string;
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
