import type { CohortEventFilter, CohortPropertyOperator } from '@qurvo/db';
import type { Expr, FuncCallExpr } from '@qurvo/ch-query';
import {
  and, argMax, col, coalesce, dictGetOrNull, eq, escapeLikePattern,
  func, gt as chGt, gte, inArray, jsonExtractRaw, jsonExtractString, jsonHas,
  like, literal, lt as chLt, lte, match, multiSearchAny, namedParam,
  neq, not, notInArray, notLike, now64, or,
  parseDateTimeBestEffort, parseDateTimeBestEffortOrZero,
  raw, rawWithParams, select, toDate, toFloat64OrZero, toString, tuple,
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

// ── Numeric comparator map ──

const NUMERIC_CMP_MAP = {
  gt: chGt,
  lt: chLt,
  gte,
  lte,
} as const;

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
 * Pure-AST operator application. Maps a property column expression and an operator
 * to a typed Expr using ch-query builders. No raw()/rawWithParams()/compileExprToSql().
 *
 * Parameters are embedded via namedParam() and also written to `queryParams` for
 * backward compatibility with the cohort-query BuildContext.
 *
 * Used by both cohort-query (person-level argMax-wrapped exprs) and analytics
 * (event-level direct column exprs).
 */
export function applyOperator(
  expr: Expr,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): Expr {
  switch (operator) {
    case 'eq': {
      const v = value ?? '';
      queryParams[pk] = v;
      const valP = namedParam(pk, 'String', v);
      const rawEquiv = toRawExpr(expr);
      if (rawEquiv) {
        // JSONExtractString eq: also check toString(JSONExtractRaw) for boolean/number values
        return or(eq(expr, valP), eq(toString(rawEquiv), valP));
      }
      return eq(expr, valP);
    }
    case 'neq': {
      const v = value ?? '';
      queryParams[pk] = v;
      const valP = namedParam(pk, 'String', v);
      const rawEquiv = toRawExpr(expr);
      const jsonHasExpr = toJsonHasGuard(expr);
      if (rawEquiv) {
        const guard = jsonHasExpr ?? undefined;
        return and(guard, neq(expr, valP), neq(toString(rawEquiv), valP));
      }
      if (jsonHasExpr) {
        return and(jsonHasExpr, neq(expr, valP));
      }
      return neq(expr, valP);
    }
    case 'contains': {
      const likeVal = `%${escapeLikePattern(value ?? '')}%`;
      queryParams[pk] = likeVal;
      return like(expr, namedParam(pk, 'String', likeVal));
    }
    case 'not_contains': {
      const likeVal = `%${escapeLikePattern(value ?? '')}%`;
      queryParams[pk] = likeVal;
      const jsonHasExpr = toJsonHasGuard(expr);
      if (jsonHasExpr) {
        return and(jsonHasExpr, notLike(expr, namedParam(pk, 'String', likeVal)));
      }
      return notLike(expr, namedParam(pk, 'String', likeVal));
    }
    case 'is_set': {
      const jsonHasExpr = toJsonHasGuard(expr);
      if (jsonHasExpr) return jsonHasExpr;
      return neq(expr, literal(''));
    }
    case 'is_not_set': {
      const jsonHasExpr = toJsonHasGuard(expr);
      if (jsonHasExpr) return not(jsonHasExpr);
      return eq(expr, literal(''));
    }
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte': {
      const numVal = Number(value ?? 0);
      queryParams[pk] = numVal;
      const numExpr = toFloat64OrZero(toNumericExpr(expr));
      return NUMERIC_CMP_MAP[operator](numExpr, namedParam(pk, 'Float64', numVal));
    }
    case 'regex': {
      const v = value ?? '';
      queryParams[pk] = v;
      return match(expr, namedParam(pk, 'String', v));
    }
    case 'not_regex': {
      const v = value ?? '';
      queryParams[pk] = v;
      return not(match(expr, namedParam(pk, 'String', v)));
    }
    case 'in': {
      const v = values ?? [];
      queryParams[pk] = v;
      return inArray(expr, namedParam(pk, 'Array(String)', v));
    }
    case 'not_in': {
      const v = values ?? [];
      queryParams[pk] = v;
      return notInArray(expr, namedParam(pk, 'Array(String)', v));
    }
    case 'between': {
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      const minVal = Number(values?.[0] ?? 0);
      const maxVal = Number(values?.[1] ?? 0);
      queryParams[minPk] = minVal;
      queryParams[maxPk] = maxVal;
      const numExpr = toFloat64OrZero(toNumericExpr(expr));
      return and(
        gte(numExpr, namedParam(minPk, 'Float64', minVal)),
        lte(numExpr, namedParam(maxPk, 'Float64', maxVal)),
      );
    }
    case 'not_between': {
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      const minVal = Number(values?.[0] ?? 0);
      const maxVal = Number(values?.[1] ?? 0);
      queryParams[minPk] = minVal;
      queryParams[maxPk] = maxVal;
      const numExpr = toFloat64OrZero(toNumericExpr(expr));
      return or(
        chLt(numExpr, namedParam(minPk, 'Float64', minVal)),
        chGt(numExpr, namedParam(maxPk, 'Float64', maxVal)),
      );
    }
    case 'is_date_before': {
      if (!value) return literal(0);
      queryParams[pk] = value;
      const parsed = parseDateTimeBestEffortOrZero(expr);
      const nonZero = neq(parsed, func('toDateTime', literal(0)));
      return and(nonZero, chLt(parsed, parseDateTimeBestEffort(namedParam(pk, 'String', value))));
    }
    case 'is_date_after': {
      if (!value) return literal(0);
      queryParams[pk] = value;
      const parsed = parseDateTimeBestEffortOrZero(expr);
      const nonZero = neq(parsed, func('toDateTime', literal(0)));
      return and(nonZero, chGt(parsed, parseDateTimeBestEffort(namedParam(pk, 'String', value))));
    }
    case 'is_date_exact': {
      if (!value) return literal(0);
      queryParams[pk] = value;
      const parsed = parseDateTimeBestEffortOrZero(expr);
      const nonZero = neq(parsed, func('toDateTime', literal(0)));
      return and(nonZero, eq(toDate(parsed), toDate(parseDateTimeBestEffort(namedParam(pk, 'String', value)))));
    }
    case 'contains_multi': {
      const v = values ?? [];
      queryParams[pk] = v;
      return multiSearchAny(expr, namedParam(pk, 'Array(String)', v));
    }
    case 'not_contains_multi': {
      const v = values ?? [];
      queryParams[pk] = v;
      return not(multiSearchAny(expr, namedParam(pk, 'Array(String)', v)));
    }
    default: {
      const _exhaustive: never = operator;
      throw new Error(`Unhandled operator: ${_exhaustive}`);
    }
  }
}

/**
 * @deprecated Use applyOperator() instead. Kept temporarily for backward compatibility.
 * Delegates to applyOperator().
 */
export function buildOperatorClause(
  expr: Expr,
  operator: CohortPropertyOperator,
  pk: string,
  queryParams: Record<string, unknown>,
  value?: string,
  values?: string[],
): Expr {
  return applyOperator(expr, operator, pk, queryParams, value, values);
}

/**
 * Returns an Expr for the upper bound datetime of behavioral cohort conditions.
 *
 * When ctx.dateTo is set: namedParam('coh_date_to', 'DateTime64(3)', value)
 * When ctx.dateTo is absent: now64(3)
 */
export function resolveDateTo(ctx: BuildContext): Expr {
  if (ctx.dateTo !== undefined) {
    ctx.queryParams['coh_date_to'] = ctx.dateTo;
    return namedParam('coh_date_to', 'DateTime64(3)', ctx.dateTo);
  }
  return now64(literal(3));
}

/**
 * Returns an Expr for the lower bound datetime, or undefined when absent.
 */
export function resolveDateFrom(ctx: BuildContext): Expr | undefined {
  if (ctx.dateFrom !== undefined) {
    ctx.queryParams['coh_date_from'] = ctx.dateFrom;
    return namedParam('coh_date_from', 'DateTime64(3)', ctx.dateFrom);
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
    parts.push(applyOperator(expr, f.operator, pk, queryParams, f.value, f.values));
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
