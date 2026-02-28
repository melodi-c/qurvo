import type { Expr } from '@qurvo/ch-query';
import {
  and,
  eq,
  inArray,
  like,
  neq,
  not,
  notLike,
  or,
  param,
  raw,
  rawWithParams,
  compileExprToSql,
} from '@qurvo/ch-query';
import { buildCohortFilterClause } from '@qurvo/cohort-query';
import { timeRange } from './time';

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

/**
 * Strict validation for JSON path key segments.
 * Only allows alphanumeric characters, underscores, hyphens, and dots.
 * Rejects any characters that could enable SQL injection (quotes, brackets, semicolons, etc).
 */
const SAFE_JSON_KEY_REGEX = /^[a-zA-Z0-9_\-.]+$/;

function validateJsonKey(segment: string): void {
  if (!SAFE_JSON_KEY_REGEX.test(segment)) {
    throw new Error(
      `Invalid JSON key segment: "${segment}". ` +
      `Only alphanumeric characters, underscores, hyphens, and dots are allowed.`,
    );
  }
}

function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

function escapeJsonKey(segment: string): string {
  validateJsonKey(segment);
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
  if (source) {return buildJsonExtractStringExpr(source.jsonColumn, source.segments);}
  if (DIRECT_COLUMNS.has(prop)) {return prop;}
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
  inputs: CohortFilterInputLike[] | undefined,
  projectId: string,
  dateTo?: string,
  dateFrom?: string,
): Expr | undefined {
  if (!inputs?.length) {return undefined;}

  // Collect params populated by buildCohortFilterClause into a local object.
  // These will be embedded into the RawWithParamsExpr and merged during compilation.
  const cohortParams: Record<string, unknown> = {};
  cohortParams['project_id'] = projectId;

  // CohortFilterInputLike is structurally compatible with CohortFilterInput
  // but uses `unknown` for the `definition` field to avoid pulling @qurvo/db
  // types into ch-query. The cast is safe because buildCohortFilterClause only
  // reads `definition` to pass it to buildCohortSubquery which handles unknown shapes.
  type CohortFilterInputCast = Parameters<typeof buildCohortFilterClause>[0][number];
  const expr = buildCohortFilterClause(
    inputs as CohortFilterInputCast[],
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
 * Minimal type for cohort filter inputs -- avoids importing the full @qurvo/db types
 * into the query-helpers package. Compatible with CohortFilterInput from @qurvo/cohort-query.
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
  cohortFilters?: CohortFilterInputLike[];
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
