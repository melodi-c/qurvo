import type { CohortEventFilter, CohortPropertyOperator } from '@qurvo/db';
import type { BuildContext } from './types';

/**
 * Escapes LIKE-wildcard characters (%, _, \) in a user-provided string
 * so they are treated as literals in ClickHouse LIKE patterns.
 */
function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

export const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

export const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

function escapeJsonKey(key: string): string {
  return key
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\0')
    .replace(/'/g, "\\'");
}

/**
 * Converts a string-typed property expression to one suitable for numeric comparison.
 *
 * `JSONExtractString` returns `''` (empty string) for JSON number/bool values, so
 * `toFloat64OrZero(JSONExtractString(...))` always evaluates to 0 for numeric fields.
 *
 * `JSONExtractRaw` returns the raw JSON token (e.g. `'42'`, `'3.14'`, `'true'`), so
 * `toFloat64OrZero(JSONExtractRaw(...))` correctly parses the numeric value.
 *
 * For top-level column expressions that do not contain `JSONExtractString` the original
 * expression is returned unchanged — those are already numeric-compatible.
 */
function toNumericExpr(expr: string): string {
  return expr.replace(/\bJSONExtractString\b/g, 'JSONExtractRaw');
}

/**
 * Returns a corresponding JSONExtractRaw expression for a JSONExtractString expression,
 * or null if the expression is not a JSONExtractString call.
 *
 * Used to build OR conditions for eq/neq operators so that boolean/number JSON values
 * (e.g. `true`, `false`, `42`) are correctly matched.
 *
 * JSONExtractString returns '' for boolean/number values, so `= 'true'` never matches
 * `{"active": true}`. JSONExtractRaw returns the raw token ('true'), so an OR with the
 * raw comparison covers both string and boolean/number cases.
 */
function toRawExpr(expr: string): string | null {
  if (!expr.includes('JSONExtractString')) return null;
  return expr.replace(/\bJSONExtractString\b/g, 'JSONExtractRaw');
}

function extractJsonKey(property: string): { column: 'properties' | 'user_properties'; key: string } {
  if (property.startsWith('properties.')) {
    return { column: 'properties', key: escapeJsonKey(property.slice('properties.'.length)) };
  }
  const rawKey = property.startsWith('user_properties.')
    ? property.slice('user_properties.'.length)
    : property;
  return { column: 'user_properties', key: escapeJsonKey(rawKey) };
}

export function resolvePropertyExpr(property: string): string {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return `argMax(${property}, timestamp)`;
  }
  const { column, key } = extractJsonKey(property);
  return `JSONExtractString(argMax(${column}, timestamp), '${key}')`;
}

/**
 * Resolves a property expression for event-level filtering (no GROUP BY / argMax).
 * Used inside WHERE clauses on individual event rows.
 */
export function resolveEventPropertyExpr(property: string): string {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return property;
  }
  const { column, key } = extractJsonKey(property);
  return `JSONExtractString(${column}, '${key}')`;
}

/**
 * Builds a single ClickHouse comparison clause for a property operator.
 * Shared by property-condition HAVING and event-filter WHERE contexts.
 */
export function buildOperatorClause(
  expr: string,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): string {
  switch (operator) {
    case 'eq': {
      queryParams[pk] = value ?? '';
      const rawEqExpr = toRawExpr(expr);
      if (rawEqExpr) {
        // JSONExtractString returns '' for boolean/number values (e.g. true, false, 42).
        // JSONExtractRaw returns the raw token ('true', 'false', '42').
        // OR-ing both ensures string values and boolean/number values are both matched.
        return `(${expr} = {${pk}:String} OR toString(${rawEqExpr}) = {${pk}:String})`;
      }
      return `${expr} = {${pk}:String}`;
    }
    case 'neq': {
      queryParams[pk] = value ?? '';
      const rawNeqExpr = toRawExpr(expr);
      if (rawNeqExpr) {
        return `(${expr} != {${pk}:String} AND toString(${rawNeqExpr}) != {${pk}:String})`;
      }
      return `${expr} != {${pk}:String}`;
    }
    case 'contains':
      queryParams[pk] = `%${escapeLikePattern(value ?? '')}%`;
      return `${expr} LIKE {${pk}:String}`;
    case 'not_contains':
      queryParams[pk] = `%${escapeLikePattern(value ?? '')}%`;
      return `${expr} NOT LIKE {${pk}:String}`;
    case 'is_set': {
      // JSONExtractString returns '' for boolean/number JSON values (e.g. true, 42),
      // so `expr != ''` incorrectly returns false for properties like {"active": true}.
      // JSONExtractRaw returns the raw token ('true', '42', '"hello"') or '' when the
      // key is absent. Checking rawExpr NOT IN ('', 'null') correctly handles all types.
      const rawIsSetExpr = toRawExpr(expr);
      if (rawIsSetExpr) {
        return `${rawIsSetExpr} NOT IN ('', 'null')`;
      }
      return `${expr} != ''`;
    }
    case 'is_not_set': {
      // Same reasoning as is_set — use JSONExtractRaw so boolean/number values
      // are treated as "set" rather than "not set".
      const rawIsNotSetExpr = toRawExpr(expr);
      if (rawIsNotSetExpr) {
        return `${rawIsNotSetExpr} IN ('', 'null')`;
      }
      return `${expr} = ''`;
    }
    case 'gt': {
      const numExpr = toNumericExpr(expr);
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${numExpr}) > {${pk}:Float64}`;
    }
    case 'lt': {
      const numExpr = toNumericExpr(expr);
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${numExpr}) < {${pk}:Float64}`;
    }
    case 'gte': {
      const numExpr = toNumericExpr(expr);
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${numExpr}) >= {${pk}:Float64}`;
    }
    case 'lte': {
      const numExpr = toNumericExpr(expr);
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${numExpr}) <= {${pk}:Float64}`;
    }
    case 'regex':
      queryParams[pk] = value ?? '';
      return `match(${expr}, {${pk}:String})`;
    case 'not_regex':
      queryParams[pk] = value ?? '';
      return `NOT match(${expr}, {${pk}:String})`;
    case 'in':
      queryParams[pk] = values ?? [];
      return `${expr} IN {${pk}:Array(String)}`;
    case 'not_in':
      queryParams[pk] = values ?? [];
      return `${expr} NOT IN {${pk}:Array(String)}`;
    case 'between': {
      const numExpr = toNumericExpr(expr);
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return `toFloat64OrZero(${numExpr}) >= {${minPk}:Float64} AND toFloat64OrZero(${numExpr}) <= {${maxPk}:Float64}`;
    }
    case 'not_between': {
      const numExpr = toNumericExpr(expr);
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return `(toFloat64OrZero(${numExpr}) < {${minPk}:Float64} OR toFloat64OrZero(${numExpr}) > {${maxPk}:Float64})`;
    }
    case 'is_date_before':
      queryParams[pk] = value ?? '';
      return `parseDateTimeBestEffortOrZero(${expr}) < parseDateTimeBestEffort({${pk}:String})`;
    case 'is_date_after':
      queryParams[pk] = value ?? '';
      return `parseDateTimeBestEffortOrZero(${expr}) > parseDateTimeBestEffort({${pk}:String})`;
    case 'is_date_exact':
      queryParams[pk] = value ?? '';
      return `toDate(parseDateTimeBestEffortOrZero(${expr})) = toDate(parseDateTimeBestEffort({${pk}:String}))`;
    case 'contains_multi':
      queryParams[pk] = values ?? [];
      return `multiSearchAny(${expr}, {${pk}:Array(String)})`;
    case 'not_contains_multi':
      queryParams[pk] = values ?? [];
      return `NOT multiSearchAny(${expr}, {${pk}:Array(String)})`;
    default: {
      const _exhaustive: never = operator;
      throw new Error(`Unhandled operator: ${_exhaustive}`);
    }
  }
}

/**
 * Returns the SQL expression to use as the "current time" upper bound for
 * behavioral cohort conditions.
 *
 * When `ctx.dateTo` is set, the value is stored in `queryParams` under the
 * key `"coh_date_to"` (idempotent — same value written on every call) and the
 * function returns the parameterised expression `{coh_date_to:DateTime64(3)}`.
 * This makes the subquery deterministic for any fixed `date_to`, which is
 * essential for both historical correctness and Redis cache coherence.
 *
 * When `ctx.dateTo` is absent (e.g. cohort-worker recomputation, AI tool),
 * the function returns `now64(3)` — matching the DateTime64(3) precision of
 * the events table to avoid false exclusions when event timestamps contain
 * sub-second precision (now() returns DateTime, and comparing DateTime64(3)
 * '16:28:08.500' <= DateTime '16:28:08' evaluates to false).
 */
export function resolveDateTo(ctx: BuildContext): string {
  if (ctx.dateTo !== undefined) {
    ctx.queryParams['coh_date_to'] = ctx.dateTo;
    return '{coh_date_to:DateTime64(3)}';
  }
  return 'now64(3)';
}

/**
 * Returns the SQL expression to use as the "current time" lower bound for the
 * `not_performed_event` condition when both `ctx.dateFrom` and `ctx.dateTo` are set.
 *
 * When both are set, the value is stored in `queryParams` under the key
 * `"coh_date_from"` (idempotent — same value written on every call) and the
 * function returns `{coh_date_from:DateTime64(3)}`, enabling a precise
 * `[dateFrom, dateTo]` absence check.
 *
 * Returns `undefined` when `ctx.dateFrom` is absent, signalling the caller to
 * fall back to the rolling `[dateTo - N days, dateTo]` window.
 */
export function resolveDateFrom(ctx: BuildContext): string | undefined {
  if (ctx.dateFrom !== undefined) {
    ctx.queryParams['coh_date_from'] = ctx.dateFrom;
    return '{coh_date_from:DateTime64(3)}';
  }
  return undefined;
}

/**
 * Builds WHERE clause fragments for event filters (property sub-filters on event conditions).
 */
export function buildEventFilterClauses(
  filters: CohortEventFilter[] | undefined,
  prefix: string,
  queryParams: Record<string, unknown>,
): string {
  if (!filters || filters.length === 0) return '';

  const parts: string[] = [];
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    const pk = `${prefix}_ef${i}`;
    const expr = resolveEventPropertyExpr(f.property);
    parts.push(buildOperatorClause(expr, f.operator, pk, queryParams, f.value, f.values));
  }

  return parts.length > 0 ? ' AND ' + parts.join(' AND ') : '';
}
