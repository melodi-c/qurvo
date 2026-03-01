import type { CohortEventFilter, CohortPropertyOperator } from '@qurvo/db';
import type { Expr } from '@qurvo/ch-query';
import { and, raw, rawWithParams, select } from '@qurvo/ch-query';
import { compileExprToSql } from '@qurvo/ch-query';
import type { BuildContext } from './types';

/**
 * The raw SQL expression for resolving a person's canonical ID via the
 * person_overrides_dict dictionary.
 */
export const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

export const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

// ── Internal string helpers ──

function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

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
 * Replaces JSONExtractString with JSONExtractRaw so toFloat64OrZero parses correctly.
 */
function toNumericExprStr(expr: string): string {
  return expr.replace(/\bJSONExtractString\b/g, 'JSONExtractRaw');
}

/**
 * Returns a corresponding JSONExtractRaw expression for a JSONExtractString expression,
 * or null if the expression is not a JSONExtractString call.
 */
function toRawExprStr(expr: string): string | null {
  if (!expr.includes('JSONExtractString')) return null;
  return expr.replace(/\bJSONExtractString\b/g, 'JSONExtractRaw');
}

/**
 * Converts a JSONExtractString(col, 'key') expression to JSONHas(col, 'key').
 * Returns null if the expression is not a JSONExtractString call.
 * Aligned with analytics filters that use JSONHas for is_set/neq guards.
 */
function toJsonHasExpr(exprSql: string): string | null {
  // Match JSONExtractString(column, 'key') or argMax-wrapped variants
  const directMatch = exprSql.match(/^JSONExtractString\((.+)\)$/);
  if (directMatch) {
    return `JSONHas(${directMatch[1]})`;
  }
  // For argMax-wrapped: JSONExtractString(argMax(col, timestamp), 'key')
  // We need the column and key from inside the JSONExtractString
  if (exprSql.includes('JSONExtractString(argMax(')) {
    const innerMatch = exprSql.match(/JSONExtractString\(argMax\(([^,]+),\s*timestamp\),\s*'([^']+)'\)/);
    if (innerMatch) {
      return `JSONHas(argMax(${innerMatch[1]}, timestamp), '${innerMatch[2]}')`;
    }
  }
  return null;
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

// ── Expr-returning public API ──

/**
 * Resolves a person property to its SQL expression wrapped as Expr.
 * For top-level columns: argMax(column, timestamp)
 * For JSON properties: JSONExtractString(argMax(column, timestamp), 'key')
 */
export function resolvePropertyExpr(property: string): Expr {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return raw(`argMax(${property}, timestamp)`);
  }
  const { column, key } = extractJsonKey(property);
  return raw(`JSONExtractString(argMax(${column}, timestamp), '${key}')`);
}

/**
 * Resolves a property expression for event-level filtering (no GROUP BY / argMax).
 * Used inside WHERE clauses on individual event rows.
 */
export function resolveEventPropertyExpr(property: string): Expr {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return raw(property);
  }
  const { column, key } = extractJsonKey(property);
  return raw(`JSONExtractString(${column}, '${key}')`);
}

/**
 * Builds a single ClickHouse comparison clause for a property operator.
 * Accepts an Expr and returns an Expr (with params embedded via rawWithParams).
 *
 * Note: This function uses compileExprToSql internally because the operator logic
 * needs to inspect and transform the SQL string (e.g., JSONExtractString -> JSONExtractRaw
 * for numeric comparisons, JSONHas for is_set/neq guards). This is a legitimate use
 * of raw SQL manipulation, not the anti-pattern being eliminated in conditions/.
 */
export function buildOperatorClause(
  expr: Expr,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): Expr {
  // Compile the incoming Expr to a SQL string for string-level transformations.
  const exprSql = compileExprToSql(expr).sql;

  switch (operator) {
    case 'eq': {
      queryParams[pk] = value ?? '';
      const rawEqExpr = toRawExprStr(exprSql);
      if (rawEqExpr) {
        return rawWithParams(
          `(${exprSql} = {${pk}:String} OR toString(${rawEqExpr}) = {${pk}:String})`,
          { [pk]: value ?? '' },
        );
      }
      return rawWithParams(`${exprSql} = {${pk}:String}`, { [pk]: value ?? '' });
    }
    case 'neq': {
      queryParams[pk] = value ?? '';
      const rawNeqExpr = toRawExprStr(exprSql);
      const jsonHasGuard = toJsonHasExpr(exprSql);
      if (rawNeqExpr) {
        const guard = jsonHasGuard ? `${jsonHasGuard} AND ` : '';
        return rawWithParams(
          `(${guard}${exprSql} != {${pk}:String} AND toString(${rawNeqExpr}) != {${pk}:String})`,
          { [pk]: value ?? '' },
        );
      }
      if (jsonHasGuard) {
        return rawWithParams(`${jsonHasGuard} AND ${exprSql} != {${pk}:String}`, { [pk]: value ?? '' });
      }
      return rawWithParams(`${exprSql} != {${pk}:String}`, { [pk]: value ?? '' });
    }
    case 'contains': {
      const likeVal = `%${escapeLikePattern(value ?? '')}%`;
      queryParams[pk] = likeVal;
      return rawWithParams(`${exprSql} LIKE {${pk}:String}`, { [pk]: likeVal });
    }
    case 'not_contains': {
      const likeVal = `%${escapeLikePattern(value ?? '')}%`;
      queryParams[pk] = likeVal;
      return rawWithParams(`${exprSql} NOT LIKE {${pk}:String}`, { [pk]: likeVal });
    }
    case 'is_set': {
      const jsonHasExpr = toJsonHasExpr(exprSql);
      if (jsonHasExpr) {
        return raw(jsonHasExpr);
      }
      return raw(`${exprSql} != ''`);
    }
    case 'is_not_set': {
      const jsonHasExpr = toJsonHasExpr(exprSql);
      if (jsonHasExpr) {
        return raw(`NOT ${jsonHasExpr}`);
      }
      return raw(`${exprSql} = ''`);
    }
    case 'gt': {
      const numExpr = toNumericExprStr(exprSql);
      queryParams[pk] = Number(value ?? 0);
      return rawWithParams(`toFloat64OrZero(${numExpr}) > {${pk}:Float64}`, { [pk]: Number(value ?? 0) });
    }
    case 'lt': {
      const numExpr = toNumericExprStr(exprSql);
      queryParams[pk] = Number(value ?? 0);
      return rawWithParams(`toFloat64OrZero(${numExpr}) < {${pk}:Float64}`, { [pk]: Number(value ?? 0) });
    }
    case 'gte': {
      const numExpr = toNumericExprStr(exprSql);
      queryParams[pk] = Number(value ?? 0);
      return rawWithParams(`toFloat64OrZero(${numExpr}) >= {${pk}:Float64}`, { [pk]: Number(value ?? 0) });
    }
    case 'lte': {
      const numExpr = toNumericExprStr(exprSql);
      queryParams[pk] = Number(value ?? 0);
      return rawWithParams(`toFloat64OrZero(${numExpr}) <= {${pk}:Float64}`, { [pk]: Number(value ?? 0) });
    }
    case 'regex': {
      queryParams[pk] = value ?? '';
      return rawWithParams(`match(${exprSql}, {${pk}:String})`, { [pk]: value ?? '' });
    }
    case 'not_regex': {
      queryParams[pk] = value ?? '';
      return rawWithParams(`NOT match(${exprSql}, {${pk}:String})`, { [pk]: value ?? '' });
    }
    case 'in': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`${exprSql} IN {${pk}:Array(String)}`, { [pk]: values ?? [] });
    }
    case 'not_in': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`${exprSql} NOT IN {${pk}:Array(String)}`, { [pk]: values ?? [] });
    }
    case 'between': {
      const numExpr = toNumericExprStr(exprSql);
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return rawWithParams(
        `toFloat64OrZero(${numExpr}) >= {${minPk}:Float64} AND toFloat64OrZero(${numExpr}) <= {${maxPk}:Float64}`,
        { [minPk]: Number(values?.[0] ?? 0), [maxPk]: Number(values?.[1] ?? 0) },
      );
    }
    case 'not_between': {
      const numExpr = toNumericExprStr(exprSql);
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return rawWithParams(
        `(toFloat64OrZero(${numExpr}) < {${minPk}:Float64} OR toFloat64OrZero(${numExpr}) > {${maxPk}:Float64})`,
        { [minPk]: Number(values?.[0] ?? 0), [maxPk]: Number(values?.[1] ?? 0) },
      );
    }
    case 'is_date_before': {
      if (!value) return raw('1 = 0');
      queryParams[pk] = value;
      return rawWithParams(
        `(parseDateTimeBestEffortOrZero(${exprSql}) != toDateTime(0) AND parseDateTimeBestEffortOrZero(${exprSql}) < parseDateTimeBestEffort({${pk}:String}))`,
        { [pk]: value },
      );
    }
    case 'is_date_after': {
      if (!value) return raw('1 = 0');
      queryParams[pk] = value;
      return rawWithParams(
        `(parseDateTimeBestEffortOrZero(${exprSql}) != toDateTime(0) AND parseDateTimeBestEffortOrZero(${exprSql}) > parseDateTimeBestEffort({${pk}:String}))`,
        { [pk]: value },
      );
    }
    case 'is_date_exact': {
      if (!value) return raw('1 = 0');
      queryParams[pk] = value;
      return rawWithParams(
        `(parseDateTimeBestEffortOrZero(${exprSql}) != toDateTime(0) AND toDate(parseDateTimeBestEffortOrZero(${exprSql})) = toDate(parseDateTimeBestEffort({${pk}:String})))`,
        { [pk]: value },
      );
    }
    case 'contains_multi': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`multiSearchAny(${exprSql}, {${pk}:Array(String)})`, { [pk]: values ?? [] });
    }
    case 'not_contains_multi': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`NOT multiSearchAny(${exprSql}, {${pk}:Array(String)})`, { [pk]: values ?? [] });
    }
    default: {
      const _exhaustive: never = operator;
      throw new Error(`Unhandled operator: ${_exhaustive}`);
    }
  }
}

/**
 * Returns an Expr for the upper bound datetime of behavioral cohort conditions.
 *
 * When ctx.dateTo is set: rawWithParams('{coh_date_to:DateTime64(3)}', ...)
 * When ctx.dateTo is absent: raw('now64(3)')
 */
export function resolveDateTo(ctx: BuildContext): Expr {
  if (ctx.dateTo !== undefined) {
    ctx.queryParams['coh_date_to'] = ctx.dateTo;
    return rawWithParams('{coh_date_to:DateTime64(3)}', { coh_date_to: ctx.dateTo });
  }
  return raw('now64(3)');
}

/**
 * Returns an Expr for the lower bound datetime, or undefined when absent.
 */
export function resolveDateFrom(ctx: BuildContext): Expr | undefined {
  if (ctx.dateFrom !== undefined) {
    ctx.queryParams['coh_date_from'] = ctx.dateFrom;
    return rawWithParams('{coh_date_from:DateTime64(3)}', { coh_date_from: ctx.dateFrom });
  }
  return undefined;
}

/**
 * Builds WHERE clause Expr for event filters (property sub-filters on event conditions).
 * Returns undefined if no filters are provided.
 */
export function buildEventFilterClauses(
  filters: CohortEventFilter[] | undefined,
  prefix: string,
  queryParams: Record<string, unknown>,
): Expr | undefined {
  if (!filters || filters.length === 0) return undefined;

  const parts: Expr[] = [];
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    const pk = `${prefix}_ef${i}`;
    const expr = resolveEventPropertyExpr(f.property);
    parts.push(buildOperatorClause(expr, f.operator, pk, queryParams, f.value, f.values));
  }

  return parts.length > 0 ? and(...parts) : undefined;
}

// ── Condition builder micro-helpers ──

/**
 * Allocates a condition index and returns commonly-needed param keys.
 * Extracts the `condIdx = ctx.counter.value++; pk = coh_${condIdx}_...` boilerplate
 * that repeats in 6+ condition builder files.
 */
export function allocCondIdx(ctx: BuildContext): {
  condIdx: number;
  eventPk: string;
  daysPk: string;
  countPk: string;
} {
  const condIdx = ctx.counter.value++;
  return {
    condIdx,
    eventPk: `coh_${condIdx}_event`,
    daysPk: `coh_${condIdx}_days`,
    countPk: `coh_${condIdx}_count`,
  };
}

// ── Deprecated string-returning bridge functions ──
// These are kept for external backward compatibility but are no longer used
// by internal condition builders.

/** Compile an Expr to its SQL string representation. */
function exprToSql(expr: Expr): string {
  return compileExprToSql(expr).sql;
}

/** @deprecated Use resolvePropertyExpr() (Expr-returning) directly. */
export function resolvePropertyExprStr(property: string): string {
  return exprToSql(resolvePropertyExpr(property));
}

/** @deprecated Use resolveEventPropertyExpr() (Expr-returning) directly. */
export function resolveEventPropertyExprStr(property: string): string {
  return exprToSql(resolveEventPropertyExpr(property));
}

/** @deprecated Use buildOperatorClause() (Expr-returning) directly. */
export function buildOperatorClauseStr(
  exprStr: string,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): string {
  const result = buildOperatorClause(raw(exprStr), operator, pk, queryParams, value, values);
  return exprToSql(result);
}

/** @deprecated Use resolveDateTo() (Expr-returning) directly. */
export function resolveDateToStr(ctx: BuildContext): string {
  return exprToSql(resolveDateTo(ctx));
}

/** @deprecated Use resolveDateFrom() (Expr-returning) directly. */
export function resolveDateFromStr(ctx: BuildContext): string | undefined {
  const result = resolveDateFrom(ctx);
  if (!result) return undefined;
  return exprToSql(result);
}

/**
 * String-returning wrapper for buildEventFilterClauses.
 * Returns ' AND ...' prefixed string or empty string (matching old API).
 * @deprecated Use buildEventFilterClauses() (Expr-returning) directly.
 */
export function buildEventFilterClausesStr(
  filters: CohortEventFilter[] | undefined,
  prefix: string,
  queryParams: Record<string, unknown>,
): string {
  const result = buildEventFilterClauses(filters, prefix, queryParams);
  if (!result) return '';
  return ' AND ' + exprToSql(result);
}

/**
 * Builds the countIf condition string: `event_name = {pk:String} [AND filter1 AND filter2 ...]`.
 * @deprecated No longer used internally; kept for external backward compat.
 */
export function buildCountIfCondStr(
  eventPk: string,
  condIdx: number,
  filters: import('@qurvo/db').CohortEventFilter[] | undefined,
  queryParams: Record<string, unknown>,
): string {
  const parts: string[] = [`event_name = {${eventPk}:String}`];
  if (filters && filters.length > 0) {
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExpr(f.property);
      const clauseExpr = buildOperatorClause(expr, f.operator, pk, queryParams, f.value, f.values);
      parts.push(compileExprToSql(clauseExpr).sql);
    }
  }
  return parts.join(' AND ');
}

/**
 * Builds a standard events-table base SELECT for cohort conditions.
 * @deprecated No longer used internally; condition builders now use col/eq/namedParam directly.
 */
export function buildEventsBaseSelect(
  ctx: BuildContext,
  upperSql: string,
  lowerSql: string,
  extraWhere?: (Expr | undefined)[],
) {
  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`timestamp >= ${lowerSql}`),
      raw(`timestamp <= ${upperSql}`),
      ...(extraWhere ?? []),
    );
}
