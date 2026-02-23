import type { CohortEventFilter } from '@qurvo/db';

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

    switch (f.operator) {
      case 'eq':
        queryParams[pk] = f.value ?? '';
        parts.push(`${expr} = {${pk}:String}`);
        break;
      case 'neq':
        queryParams[pk] = f.value ?? '';
        parts.push(`${expr} != {${pk}:String}`);
        break;
      case 'contains':
        queryParams[pk] = `%${f.value ?? ''}%`;
        parts.push(`${expr} LIKE {${pk}:String}`);
        break;
      case 'not_contains':
        queryParams[pk] = `%${f.value ?? ''}%`;
        parts.push(`${expr} NOT LIKE {${pk}:String}`);
        break;
      case 'is_set':
        parts.push(`${expr} != ''`);
        break;
      case 'is_not_set':
        parts.push(`${expr} = ''`);
        break;
      case 'gt':
        queryParams[pk] = Number(f.value ?? 0);
        parts.push(`toFloat64OrZero(${expr}) > {${pk}:Float64}`);
        break;
      case 'lt':
        queryParams[pk] = Number(f.value ?? 0);
        parts.push(`toFloat64OrZero(${expr}) < {${pk}:Float64}`);
        break;
      case 'gte':
        queryParams[pk] = Number(f.value ?? 0);
        parts.push(`toFloat64OrZero(${expr}) >= {${pk}:Float64}`);
        break;
      case 'lte':
        queryParams[pk] = Number(f.value ?? 0);
        parts.push(`toFloat64OrZero(${expr}) <= {${pk}:Float64}`);
        break;
      case 'regex':
        queryParams[pk] = f.value ?? '';
        parts.push(`match(${expr}, {${pk}:String})`);
        break;
      case 'not_regex':
        queryParams[pk] = f.value ?? '';
        parts.push(`NOT match(${expr}, {${pk}:String})`);
        break;
      case 'in':
        queryParams[pk] = f.values ?? [];
        parts.push(`${expr} IN {${pk}:Array(String)}`);
        break;
      case 'not_in':
        queryParams[pk] = f.values ?? [];
        parts.push(`${expr} NOT IN {${pk}:Array(String)}`);
        break;
      case 'between': {
        const minPk = `${pk}_min`, maxPk = `${pk}_max`;
        queryParams[minPk] = Number(f.values?.[0] ?? 0);
        queryParams[maxPk] = Number(f.values?.[1] ?? 0);
        parts.push(`toFloat64OrZero(${expr}) >= {${minPk}:Float64} AND toFloat64OrZero(${expr}) <= {${maxPk}:Float64}`);
        break;
      }
      case 'not_between': {
        const minPk = `${pk}_min`, maxPk = `${pk}_max`;
        queryParams[minPk] = Number(f.values?.[0] ?? 0);
        queryParams[maxPk] = Number(f.values?.[1] ?? 0);
        parts.push(`(toFloat64OrZero(${expr}) < {${minPk}:Float64} OR toFloat64OrZero(${expr}) > {${maxPk}:Float64})`);
        break;
      }
    }
  }

  return parts.length > 0 ? ' AND ' + parts.join(' AND ') : '';
}
