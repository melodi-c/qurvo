export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export interface PropertyFilter {
  property: string;
  operator: FilterOperator;
  value?: string;
}

const DIRECT_COLUMNS = new Set([
  'event_name', 'distinct_id', 'session_id',
  'url', 'referrer', 'page_title', 'page_path',
  'device_type', 'browser', 'browser_version',
  'os', 'os_version',
  'country', 'region', 'city',
  'language', 'timezone',
  'sdk_name', 'sdk_version',
]);

export function resolvePropertyExpr(prop: string): string {
  if (prop.startsWith('properties.')) {
    const key = prop.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(properties, '${key}')`;
  }
  if (prop.startsWith('user_properties.')) {
    const key = prop.slice('user_properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(user_properties, '${key}')`;
  }
  if (DIRECT_COLUMNS.has(prop)) return prop;
  throw new Error(`Unknown filter property: ${prop}`);
}

/**
 * Builds SQL condition strings for a list of property filters.
 * Mutates queryParams with named parameters.
 */
export function buildPropertyFilterConditions(
  filters: PropertyFilter[],
  prefix: string,
  queryParams: Record<string, unknown>,
): string[] {
  const parts: string[] = [];
  for (const [j, f] of filters.entries()) {
    const expr = resolvePropertyExpr(f.property);
    const pk = `${prefix}_f${j}_v`;
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
    }
  }
  return parts;
}
