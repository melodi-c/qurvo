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
  return key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
    case 'eq':
      queryParams[pk] = value ?? '';
      return `${expr} = {${pk}:String}`;
    case 'neq':
      queryParams[pk] = value ?? '';
      return `${expr} != {${pk}:String}`;
    case 'contains':
      queryParams[pk] = `%${escapeLikePattern(value ?? '')}%`;
      return `${expr} LIKE {${pk}:String}`;
    case 'not_contains':
      queryParams[pk] = `%${escapeLikePattern(value ?? '')}%`;
      return `${expr} NOT LIKE {${pk}:String}`;
    case 'is_set':
      return `${expr} != ''`;
    case 'is_not_set':
      return `${expr} = ''`;
    case 'gt':
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${expr}) > {${pk}:Float64}`;
    case 'lt':
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${expr}) < {${pk}:Float64}`;
    case 'gte':
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${expr}) >= {${pk}:Float64}`;
    case 'lte':
      queryParams[pk] = Number(value ?? 0);
      return `toFloat64OrZero(${expr}) <= {${pk}:Float64}`;
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
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return `toFloat64OrZero(${expr}) >= {${minPk}:Float64} AND toFloat64OrZero(${expr}) <= {${maxPk}:Float64}`;
    }
    case 'not_between': {
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      queryParams[minPk] = Number(values?.[0] ?? 0);
      queryParams[maxPk] = Number(values?.[1] ?? 0);
      return `(toFloat64OrZero(${expr}) < {${minPk}:Float64} OR toFloat64OrZero(${expr}) > {${maxPk}:Float64})`;
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
 * the function returns `now()` — preserving the previous behaviour.
 */
export function resolveDateTo(ctx: BuildContext): string {
  if (ctx.dateTo !== undefined) {
    ctx.queryParams['coh_date_to'] = ctx.dateTo;
    return '{coh_date_to:DateTime64(3)}';
  }
  return 'now()';
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
