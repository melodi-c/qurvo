import type { CohortEventFilter, CohortPropertyOperator } from '@qurvo/db';
import type { Expr, FuncCallExpr } from '@qurvo/ch-query';
import {
  and, argMax, col, coalesce, compileExprToSql, dictGetOrNull, eq, escapeLikePattern,
  func, gte, jsonExtractRaw, jsonExtractString, jsonHas, literal, lte, namedParam,
  not, now64, raw, rawWithParams, select, toFloat64OrZero, toString, tuple,
} from '@qurvo/ch-query';
import type { BuildContext } from './types';

// ── Column sets ──

/**
 * Person-level top-level columns (not JSON-extracted).
 * Used by cohort condition builders for argMax resolution.
 */
export const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

/**
 * Event-level direct columns (not JSON-extracted).
 * Superset of TOP_LEVEL_COLUMNS, includes event-specific fields.
 * Used by analytics property filters for event row resolution.
 */
export const DIRECT_COLUMNS = new Set([
  'event_name', 'distinct_id', 'session_id',
  'url', 'referrer', 'page_title', 'page_path',
  'device_type', 'browser', 'browser_version',
  'os', 'os_version',
  'country', 'region', 'city',
  'language', 'timezone',
  'sdk_name', 'sdk_version',
]);

// ── RESOLVED_PERSON ──

/**
 * The raw SQL expression for resolving a person's canonical ID via the
 * person_overrides_dict dictionary.
 *
 * String constant kept for backward compatibility with code that embeds it
 * in template literals (ai/tools, funnel-sql-shared, static-cohorts).
 */
export const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

/**
 * Returns a typed Expr for RESOLVED_PERSON with .as() support:
 * coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)
 */
export function resolvedPerson(): Expr & { as(alias: string): import('@qurvo/ch-query').AliasExpr } {
  return coalesce(
    dictGetOrNull('person_overrides_dict', 'person_id', tuple(col('project_id'), col('distinct_id'))),
    col('person_id'),
  );
}

// ── JSON key validation & escaping ──

/**
 * Strict validation for JSON path key segments.
 * Only allows alphanumeric characters, underscores, hyphens, and dots.
 * Rejects any characters that could enable SQL injection (quotes, brackets, semicolons, etc).
 */
const SAFE_JSON_KEY_REGEX = /^[a-zA-Z0-9_\-.]+$/;

export function validateJsonKey(segment: string): void {
  if (!SAFE_JSON_KEY_REGEX.test(segment)) {
    throw new Error(
      `Invalid JSON key segment: "${segment}". ` +
      `Only alphanumeric characters, underscores, hyphens, and dots are allowed.`,
    );
  }
}

/**
 * Escapes and validates a JSON property key for safe use in ClickHouse queries.
 * Validates against injection, then escapes backslash and single quote.
 */
export function escapeJsonKey(segment: string): string {
  validateJsonKey(segment);
  return segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── Property path parsing ──

export interface PropertySource {
  jsonColumn: string;
  segments: string[];
}

/**
 * Parses a property path into JSON column + key segments with nested key support.
 *
 * - "properties.foo"           → { jsonColumn: "properties", segments: ["foo"] }
 * - "properties.foo.bar"       → { jsonColumn: "properties", segments: ["foo", "bar"] }
 * - "user_properties.plan"     → { jsonColumn: "user_properties", segments: ["plan"] }
 * - "country" (direct column)  → null
 */
export function parsePropertyPath(prop: string): PropertySource | null {
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

// ── AST-level expression transforms ──

/**
 * Checks whether an Expr is a FuncCallExpr with the given name.
 */
function isFuncCall(expr: Expr, name: string): expr is FuncCallExpr {
  return expr.type === 'func' && expr.name === name;
}

/**
 * AST-level transform: replaces JSONExtractString → JSONExtractRaw in the Expr tree.
 * Returns a new Expr if a transform occurred, or null if the expr does not contain JSONExtractString.
 */
function toRawExpr(expr: Expr): Expr | null {
  if (isFuncCall(expr, 'JSONExtractString')) {
    return func('JSONExtractRaw', ...expr.args);
  }
  return null;
}

/**
 * AST-level transform: converts a JSONExtractString expr to its numeric equivalent.
 * JSONExtractString → JSONExtractRaw (for use inside toFloat64OrZero).
 * Non-JSON expressions are returned as-is.
 */
function toNumericExpr(expr: Expr): Expr {
  if (isFuncCall(expr, 'JSONExtractString')) {
    return func('JSONExtractRaw', ...expr.args);
  }
  return expr;
}

/**
 * AST-level transform: converts a JSONExtractString(col, key) → JSONHas(col, key).
 * Returns null if the expression is not a JSONExtractString call.
 */
function toJsonHasGuard(expr: Expr): Expr | null {
  if (isFuncCall(expr, 'JSONExtractString')) {
    return func('JSONHas', ...expr.args);
  }
  return null;
}

// ── Legacy string-level helpers (for backward compatibility with raw() callers) ──

/**
 * String-level: replaces JSONExtractString → JSONExtractRaw in SQL string.
 * Returns null if no JSONExtractString found.
 * @deprecated Use toRawExpr() for typed Expr inputs
 */
function toRawExprStr(sql: string): string | null {
  if (!sql.includes('JSONExtractString')) return null;
  return sql.replace(/\bJSONExtractString\b/g, 'JSONExtractRaw');
}

/**
 * String-level: replaces JSONExtractString → JSONExtractRaw for numeric comparison.
 * @deprecated Use toNumericExpr() for typed Expr inputs
 */
function toNumericExprStr(sql: string): string {
  return sql.replace(/\bJSONExtractString\b/g, 'JSONExtractRaw');
}

/**
 * String-level: converts JSONExtractString(col, 'key') → JSONHas(col, 'key').
 * Returns null if the expression is not a JSONExtractString call.
 * @deprecated Use toJsonHasGuard() for typed Expr inputs
 */
function toJsonHasExprStr(exprSql: string): string | null {
  const directMatch = exprSql.match(/^JSONExtractString\((.+)\)$/);
  if (directMatch) {
    return `JSONHas(${directMatch[1]})`;
  }
  if (exprSql.includes('JSONExtractString(argMax(')) {
    const innerMatch = exprSql.match(/JSONExtractString\(argMax\(([^,]+),\s*timestamp\),\s*'([^']+)'\)/);
    if (innerMatch) {
      return `JSONHas(argMax(${innerMatch[1]}, timestamp), '${innerMatch[2]}')`;
    }
  }
  return null;
}

// ── Expr-returning public API ──

/**
 * Resolves a person property to its typed Expr (for cohort GROUP BY / HAVING context).
 * - Top-level columns: argMax(column, timestamp)
 * - JSON properties: JSONExtractString(argMax(column, timestamp), 'key')
 *
 * Returns typed Expr (not raw string). Nested keys are supported.
 */
export function resolvePropertyExpr(property: string): Expr {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return argMax(col(property), col('timestamp'));
  }
  const source = parsePropertyPath(property);
  if (source) {
    return jsonExtractString(argMax(col(source.jsonColumn), col('timestamp')), ...source.segments);
  }
  // Fallback for unqualified user_properties keys (legacy cohort-query behavior)
  const key = escapeJsonKey(property);
  return jsonExtractString(argMax(col('user_properties'), col('timestamp')), key);
}

/**
 * Resolves a property expression for event-level filtering (no GROUP BY / argMax).
 * Used inside WHERE clauses on individual event rows.
 *
 * Returns typed Expr (not raw string). Nested keys are supported.
 */
export function resolveEventPropertyExpr(property: string): Expr {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return col(property);
  }
  const source = parsePropertyPath(property);
  if (source) {
    return jsonExtractString(col(source.jsonColumn), ...source.segments);
  }
  // Fallback for unqualified user_properties keys (legacy cohort-query behavior)
  const key = escapeJsonKey(property);
  return jsonExtractString(col('user_properties'), key);
}

/**
 * Builds a single ClickHouse comparison clause for a property operator.
 * Accepts an Expr and returns an Expr (with params embedded via rawWithParams).
 *
 * For typed Expr inputs (FuncCallExpr from jsonExtractString, argMax, col), uses
 * AST-level transforms (toNumericExpr, toRawExpr, toJsonHasGuard).
 * For raw() inputs (backward compat), falls back to string-level transforms.
 */
export function buildOperatorClause(
  expr: Expr,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): Expr {
  // Try AST-level transforms first. If expr is typed (not raw), use them.
  const useAstTransforms = expr.type === 'func' || expr.type === 'column';

  if (useAstTransforms) {
    return buildOperatorClauseTyped(expr, operator, pk, queryParams, value, values);
  }

  // Fallback: compile to SQL string for legacy raw() inputs
  const exprSql = compileExprToSql(expr).sql;
  return buildOperatorClauseRaw(exprSql, operator, pk, queryParams, value, values);
}

/**
 * Typed path: builds operator clause using AST-level transforms.
 */
function buildOperatorClauseTyped(
  expr: Expr,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): Expr {
  const valParam = () => namedParam(pk, 'String', value ?? '');
  const numParam = () => namedParam(pk, 'Float64', Number(value ?? 0));

  switch (operator) {
    case 'eq': {
      queryParams[pk] = value ?? '';
      const rawEquiv = toRawExpr(expr);
      if (rawEquiv) {
        // JSONExtractString eq: fallback to toString(JSONExtractRaw) for boolean/number
        const exprSql = compileExprToSql(expr).sql;
        const rawSql = compileExprToSql(rawEquiv).sql;
        return rawWithParams(
          `(${exprSql} = {${pk}:String} OR toString(${rawSql}) = {${pk}:String})`,
          { [pk]: value ?? '' },
        );
      }
      return rawWithParams(`${compileExprToSql(expr).sql} = {${pk}:String}`, { [pk]: value ?? '' });
    }
    case 'neq': {
      queryParams[pk] = value ?? '';
      const rawEquiv = toRawExpr(expr);
      const jsonHas = toJsonHasGuard(expr);
      const exprSql = compileExprToSql(expr).sql;
      if (rawEquiv) {
        const rawSql = compileExprToSql(rawEquiv).sql;
        const guard = jsonHas ? `${compileExprToSql(jsonHas).sql} AND ` : '';
        return rawWithParams(
          `(${guard}${exprSql} != {${pk}:String} AND toString(${rawSql}) != {${pk}:String})`,
          { [pk]: value ?? '' },
        );
      }
      if (jsonHas) {
        return rawWithParams(
          `${compileExprToSql(jsonHas).sql} AND ${exprSql} != {${pk}:String}`,
          { [pk]: value ?? '' },
        );
      }
      return rawWithParams(`${exprSql} != {${pk}:String}`, { [pk]: value ?? '' });
    }
    case 'contains': {
      const likeVal = `%${escapeLikePattern(value ?? '')}%`;
      queryParams[pk] = likeVal;
      return rawWithParams(`${compileExprToSql(expr).sql} LIKE {${pk}:String}`, { [pk]: likeVal });
    }
    case 'not_contains': {
      const likeVal = `%${escapeLikePattern(value ?? '')}%`;
      queryParams[pk] = likeVal;
      return rawWithParams(`${compileExprToSql(expr).sql} NOT LIKE {${pk}:String}`, { [pk]: likeVal });
    }
    case 'is_set': {
      const jsonHas = toJsonHasGuard(expr);
      if (jsonHas) return jsonHas;
      return raw(`${compileExprToSql(expr).sql} != ''`);
    }
    case 'is_not_set': {
      const jsonHas = toJsonHasGuard(expr);
      if (jsonHas) return not(jsonHas);
      return raw(`${compileExprToSql(expr).sql} = ''`);
    }
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte': {
      const numExpr = toFloat64OrZero(toNumericExpr(expr));
      const compiled = compileExprToSql(numExpr).sql;
      const opMap = { gt: '>', lt: '<', gte: '>=', lte: '<=' } as const;
      queryParams[pk] = Number(value ?? 0);
      return rawWithParams(`${compiled} ${opMap[operator]} {${pk}:Float64}`, { [pk]: Number(value ?? 0) });
    }
    case 'regex': {
      queryParams[pk] = value ?? '';
      return rawWithParams(`match(${compileExprToSql(expr).sql}, {${pk}:String})`, { [pk]: value ?? '' });
    }
    case 'not_regex': {
      queryParams[pk] = value ?? '';
      return rawWithParams(`NOT match(${compileExprToSql(expr).sql}, {${pk}:String})`, { [pk]: value ?? '' });
    }
    case 'in': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`${compileExprToSql(expr).sql} IN {${pk}:Array(String)}`, { [pk]: values ?? [] });
    }
    case 'not_in': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`${compileExprToSql(expr).sql} NOT IN {${pk}:Array(String)}`, { [pk]: values ?? [] });
    }
    case 'between': {
      const numExpr = compileExprToSql(toFloat64OrZero(toNumericExpr(expr))).sql;
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return rawWithParams(
        `${numExpr} >= {${minPk}:Float64} AND ${numExpr} <= {${maxPk}:Float64}`,
        { [minPk]: Number(values?.[0] ?? 0), [maxPk]: Number(values?.[1] ?? 0) },
      );
    }
    case 'not_between': {
      const numExpr = compileExprToSql(toFloat64OrZero(toNumericExpr(expr))).sql;
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return rawWithParams(
        `(${numExpr} < {${minPk}:Float64} OR ${numExpr} > {${maxPk}:Float64})`,
        { [minPk]: Number(values?.[0] ?? 0), [maxPk]: Number(values?.[1] ?? 0) },
      );
    }
    case 'is_date_before': {
      if (!value) return raw('1 = 0');
      queryParams[pk] = value;
      const exprSql = compileExprToSql(expr).sql;
      return rawWithParams(
        `(parseDateTimeBestEffortOrZero(${exprSql}) != toDateTime(0) AND parseDateTimeBestEffortOrZero(${exprSql}) < parseDateTimeBestEffort({${pk}:String}))`,
        { [pk]: value },
      );
    }
    case 'is_date_after': {
      if (!value) return raw('1 = 0');
      queryParams[pk] = value;
      const exprSql = compileExprToSql(expr).sql;
      return rawWithParams(
        `(parseDateTimeBestEffortOrZero(${exprSql}) != toDateTime(0) AND parseDateTimeBestEffortOrZero(${exprSql}) > parseDateTimeBestEffort({${pk}:String}))`,
        { [pk]: value },
      );
    }
    case 'is_date_exact': {
      if (!value) return raw('1 = 0');
      queryParams[pk] = value;
      const exprSql = compileExprToSql(expr).sql;
      return rawWithParams(
        `(parseDateTimeBestEffortOrZero(${exprSql}) != toDateTime(0) AND toDate(parseDateTimeBestEffortOrZero(${exprSql})) = toDate(parseDateTimeBestEffort({${pk}:String})))`,
        { [pk]: value },
      );
    }
    case 'contains_multi': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`multiSearchAny(${compileExprToSql(expr).sql}, {${pk}:Array(String)})`, { [pk]: values ?? [] });
    }
    case 'not_contains_multi': {
      queryParams[pk] = values ?? [];
      return rawWithParams(`NOT multiSearchAny(${compileExprToSql(expr).sql}, {${pk}:Array(String)})`, { [pk]: values ?? [] });
    }
    default: {
      const _exhaustive: never = operator;
      throw new Error(`Unhandled operator: ${_exhaustive}`);
    }
  }
}

/**
 * Legacy path: builds operator clause from compiled SQL string.
 * Used when callers pass raw() expressions (backward compat).
 */
function buildOperatorClauseRaw(
  exprSql: string,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): Expr {
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
      const jsonHasGuard = toJsonHasExprStr(exprSql);
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
      const jsonHasExpr = toJsonHasExprStr(exprSql);
      if (jsonHasExpr) {
        return raw(jsonHasExpr);
      }
      return raw(`${exprSql} != ''`);
    }
    case 'is_not_set': {
      const jsonHasExpr = toJsonHasExprStr(exprSql);
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
  return now64(literal(3));
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

/**
 * Returns the project_id equality Expr for a BuildContext:
 * `project_id = {ctx.projectIdParam:UUID}`
 *
 * Eliminates the 11+ inline repetitions of:
 *   eq(col('project_id'), namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam]))
 */
export function ctxProjectIdExpr(ctx: BuildContext): Expr {
  return eq(col('project_id'), namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam]));
}

/**
 * Returns a pre-seeded SelectBuilder for the standard events-table base query
 * used by condition builders:
 *
 *   SELECT RESOLVED_PERSON AS person_id
 *   FROM events
 *   WHERE project_id = ... AND timestamp <= upperBound [AND timestamp >= lowerExpr] [AND ...extraWhere]
 *
 * **IMPORTANT**: `SelectBuilder.where()` is NOT additive — each call replaces the
 * previous WHERE clause.  All conditions (base + caller-specific) must be supplied
 * in a single `.where()` invocation.  Pass caller-specific conditions via
 * `extraWhere` instead of chaining `.where()` on the returned builder.
 *
 * Callers chain `.groupBy()`, `.having()`, `.orderBy()` etc. as needed.
 *
 * @param ctx         Build context (provides projectIdParam and date bounds)
 * @param lowerExpr   Optional lower-bound timestamp Expr (e.g. sub(upperBound, daysInterval))
 * @param extraWhere  Additional WHERE conditions merged into the single `.where()` call
 */
export function eventsBaseSelect(ctx: BuildContext, lowerExpr?: Expr, ...extraWhere: (Expr | undefined)[]) {
  const upperBound = resolveDateTo(ctx);
  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      lte(col('timestamp'), upperBound),
      lowerExpr ? gte(col('timestamp'), lowerExpr) : undefined,
      ...extraWhere,
    );
}
