import type { Expr } from '../ast';
import {
  and,
  eq,
  func,
  inArray,
  like,
  neq,
  not,
  notLike,
  or,
  param,
  raw,
} from '../builders';
import { timeRange } from './time';
import { resolvedPerson } from './resolved-person';

// ── Types ──

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export interface PropertyFilter {
  property: string;
  operator: FilterOperator;
  value?: string;
}

// ── Direct columns (not JSON-extracted) ──

export const DIRECT_COLUMNS = new Set([
  'event_name', 'distinct_id', 'session_id',
  'url', 'referrer', 'page_title', 'page_path',
  'device_type', 'browser', 'browser_version',
  'os', 'os_version',
  'country', 'region', 'city',
  'language', 'timezone',
  'sdk_name', 'sdk_version',
]);

// ── Internal helpers ──

function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

function escapeJsonKey(segment: string): string {
  return segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

interface PropertySource {
  jsonColumn: string;
  segments: string[];
}

function resolvePropertySource(prop: string): PropertySource | null {
  let rawKey: string;
  let jsonColumn: string;
  if (prop.startsWith('properties.')) {
    jsonColumn = 'properties';
    rawKey = prop.slice('properties.'.length);
  } else if (prop.startsWith('user_properties.')) {
    jsonColumn = 'user_properties';
    rawKey = prop.slice('user_properties.'.length);
  } else {
    return null;
  }
  const segments = rawKey.split('.').map(escapeJsonKey);
  return { jsonColumn, segments };
}

function buildJsonExtractStringExpr(jsonColumn: string, segments: string[]): string {
  const args = segments.map((s) => `'${s}'`).join(', ');
  return `JSONExtractString(${jsonColumn}, ${args})`;
}

function buildJsonExtractRawExpr(jsonColumn: string, segments: string[]): string {
  let expr = jsonColumn;
  for (const seg of segments) {
    expr = `JSONExtractRaw(${expr}, '${seg}')`;
  }
  return expr;
}

function buildJsonHasExpr(jsonColumn: string, segments: string[]): string {
  if (segments.length === 1) {
    return `JSONHas(${jsonColumn}, '${segments[0]}')`;
  }
  const parentExpr = buildJsonExtractRawExpr(jsonColumn, segments.slice(0, -1));
  return `JSONHas(${parentExpr}, '${segments[segments.length - 1]}')`;
}

function resolvePropertyColumnExpr(prop: string): string {
  const source = resolvePropertySource(prop);
  if (source) return buildJsonExtractStringExpr(source.jsonColumn, source.segments);
  if (DIRECT_COLUMNS.has(prop)) return prop;
  throw new Error(`Unknown filter property: ${prop}`);
}

// ── Public API ──

/** project_id = {p_N:UUID} */
export function projectIs(projectId: string): Expr {
  return eq(raw('project_id'), param('UUID', projectId));
}

/** event_name = {p_N:String} */
export function eventIs(eventName: string): Expr {
  return eq(raw('event_name'), param('String', eventName));
}

/** event_name IN ({p_N:Array(String)}) */
export function eventIn(eventNames: string[]): Expr {
  return inArray(raw('event_name'), param('Array(String)', eventNames));
}

/**
 * Single property filter -> Expr.
 *
 * Implements the same logic as buildPropertyFilterConditions
 * but returns an AST Expr node instead of a string.
 * Values are wrapped in ParamExpr -- no mutation of external state.
 *
 * Operators:
 * - eq: (JSONExtractString = param OR toString(JSONExtractRaw) = param) for JSON,
 *        direct_col = param for direct columns
 * - neq: JSONHas AND JSONExtractString != param AND toString(JSONExtractRaw) != param
 * - contains: JSONExtractString LIKE '%value%'
 * - not_contains: JSONHas AND JSONExtractString NOT LIKE '%value%'
 * - is_set: JSONHas(col, key) for JSON, col != '' for direct
 * - is_not_set: NOT JSONHas(col, key) for JSON, col = '' for direct
 */
export function propertyFilter(filter: PropertyFilter): Expr {
  const source = resolvePropertySource(filter.property);
  const colExpr = raw(resolvePropertyColumnExpr(filter.property));
  const value = filter.value ?? '';

  switch (filter.operator) {
    case 'eq': {
      const valueParam = param('String', value);
      if (source) {
        const rawExpr = raw(`toString(${buildJsonExtractRawExpr(source.jsonColumn, source.segments)})`);
        return or(eq(colExpr, valueParam), eq(rawExpr, valueParam));
      }
      return eq(colExpr, valueParam);
    }
    case 'neq': {
      const valueParam = param('String', value);
      if (source) {
        const jsonHas = raw(buildJsonHasExpr(source.jsonColumn, source.segments));
        const rawExpr = raw(`toString(${buildJsonExtractRawExpr(source.jsonColumn, source.segments)})`);
        return and(jsonHas, neq(colExpr, valueParam), neq(rawExpr, valueParam));
      }
      return neq(colExpr, valueParam);
    }
    case 'contains': {
      const likeParam = param('String', `%${escapeLikePattern(value)}%`);
      return like(colExpr, likeParam);
    }
    case 'not_contains': {
      const likeParam = param('String', `%${escapeLikePattern(value)}%`);
      if (source) {
        const jsonHas = raw(buildJsonHasExpr(source.jsonColumn, source.segments));
        return and(jsonHas, notLike(colExpr, likeParam));
      }
      return notLike(colExpr, likeParam);
    }
    case 'is_set': {
      if (source) {
        return raw(buildJsonHasExpr(source.jsonColumn, source.segments));
      }
      return neq(colExpr, raw("''"));
    }
    case 'is_not_set': {
      if (source) {
        return not(raw(buildJsonHasExpr(source.jsonColumn, source.segments)));
      }
      return eq(colExpr, raw("''"));
    }
    default: {
      const _exhaustive: never = filter.operator;
      throw new Error(`Unhandled operator: ${_exhaustive}`);
    }
  }
}

/**
 * Array of property filters -> AND(filter1, filter2, ...).
 * Returns undefined for empty arrays (allowing and() to skip it).
 */
export function propertyFilters(filters: PropertyFilter[]): Expr | undefined {
  if (filters.length === 0) return undefined;
  return and(...filters.map(propertyFilter));
}

/**
 * Cohort filter: RESOLVED_PERSON IN (subquery).
 *
 * This is an escape-hatch adapter for @qurvo/cohort-query.
 * It calls buildCohortFilterClause() to get a SQL string, then wraps it in RawExpr.
 *
 * NOTE: cohortFilter() uses the legacy queryParams mutation pattern from
 * buildCohortFilterClause. The returned Expr is a RawExpr containing the full
 * SQL clause. The caller must pass the queryParams object to ClickHouse along
 * with the compiled query params.
 *
 * Returns undefined if inputs is empty/undefined (allowing and() to skip it).
 */
export function cohortFilter(
  inputs: CohortFilterInputLike[] | undefined,
  projectId: string,
  queryParams: Record<string, unknown>,
  dateTo?: string,
  dateFrom?: string,
): Expr | undefined {
  if (!inputs?.length) return undefined;
  // Dynamically import to avoid hard dependency at module level.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildCohortFilterClause } = require('@qurvo/cohort-query') as typeof import('@qurvo/cohort-query');
  // Cast: CohortFilterInputLike is structurally compatible with CohortFilterInput
  // but uses `unknown` for definition to avoid pulling @qurvo/db types into ch-query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clause = buildCohortFilterClause(
    inputs as any,
    // We use a RawExpr for project_id, so pass a dummy param name --
    // buildCohortFilterClause will reference {project_id:UUID} in its SQL
    'project_id',
    queryParams,
    undefined,
    dateTo,
    dateFrom,
  );
  if (!clause) return undefined;
  return raw(clause);
}

/**
 * Minimal type for cohort filter inputs — avoids importing the full @qurvo/db types
 * into the ch-query package. Compatible with CohortFilterInput from @qurvo/cohort-query.
 */
export interface CohortFilterInputLike {
  cohort_id: string;
  definition: unknown;
  materialized: boolean;
  is_static: boolean;
  membership_version?: number | null;
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
 */
export function analyticsWhere(opts: {
  projectId: string;
  from: string;
  to: string;
  tz?: string;
  eventName?: string;
  eventNames?: string[];
  filters?: PropertyFilter[];
  cohortFilters?: CohortFilterInputLike[];
  queryParams?: Record<string, unknown>;
  dateTo?: string;
  dateFrom?: string;
}): Expr {
  const qp = opts.queryParams ?? {};
  return and(
    projectIs(opts.projectId),
    timeRange(opts.from, opts.to, opts.tz),
    opts.eventName ? eventIs(opts.eventName) : undefined,
    opts.eventNames?.length ? eventIn(opts.eventNames) : undefined,
    opts.filters?.length ? propertyFilters(opts.filters) : undefined,
    opts.cohortFilters?.length
      ? cohortFilter(opts.cohortFilters, opts.projectId, qp, opts.dateTo, opts.dateFrom)
      : undefined,
  );
}

/**
 * Resolves a property name to its SQL expression for extraction.
 * Returns a raw column name for direct columns, or JSONExtractString(...) for JSON.
 */
export function resolvePropertyExpr(prop: string): Expr {
  return raw(resolvePropertyColumnExpr(prop));
}

/**
 * Resolves a numeric property to its float extraction expression.
 * toFloat64OrZero(JSONExtractRaw(properties, 'key'))
 */
export function resolveNumericPropertyExpr(prop: string): Expr {
  const source = resolvePropertySource(prop);
  if (source) {
    return raw(`toFloat64OrZero(${buildJsonExtractRawExpr(source.jsonColumn, source.segments)})`);
  }
  throw new Error(`Unknown metric property: ${prop}`);
}

export { resolvedPerson } from './resolved-person';
