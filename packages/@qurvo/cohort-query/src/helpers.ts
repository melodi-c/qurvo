import type { CohortEventFilter, CohortPropertyOperator } from '@qurvo/db';

export const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

export const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

export function resolvePropertyExpr(property: string): string {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return `argMax(${property}, timestamp)`;
  }
  if (property.startsWith('properties.')) {
    const key = property.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(argMax(properties, timestamp), '${key}')`;
  }
  const key = property.startsWith('user_properties.')
    ? property.slice('user_properties.'.length)
    : property;
  return `JSONExtractString(argMax(user_properties, timestamp), '${key.replace(/'/g, "\\'")}')`;
}

/**
 * Resolves a property expression for event-level filtering (no GROUP BY / argMax).
 * Used inside WHERE clauses on individual event rows.
 */
export function resolveEventPropertyExpr(property: string): string {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return property;
  }
  if (property.startsWith('properties.')) {
    const key = property.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(properties, '${key}')`;
  }
  const key = property.startsWith('user_properties.')
    ? property.slice('user_properties.'.length)
    : property;
  return `JSONExtractString(user_properties, '${key.replace(/'/g, "\\'")}')`;
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
      queryParams[pk] = `%${value ?? ''}%`;
      return `${expr} LIKE {${pk}:String}`;
    case 'not_contains':
      queryParams[pk] = `%${value ?? ''}%`;
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
  }
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
