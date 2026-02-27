import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { escapeLikePattern } from './escape-like';

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export interface PropertyFilter {
  property: string;
  operator: FilterOperator;
  value?: string;
}

export const DIRECT_COLUMNS = new Set([
  'event_name', 'distinct_id', 'session_id',
  'url', 'referrer', 'page_title', 'page_path',
  'device_type', 'browser', 'browser_version',
  'os', 'os_version',
  'country', 'region', 'city',
  'language', 'timezone',
  'sdk_name', 'sdk_version',
]);

/**
 * Resolves a property name to its JSON source ('properties' or 'user_properties')
 * and the extracted key. Returns null for direct columns.
 */
function escapeJsonKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolvePropertySource(prop: string): { jsonColumn: string; key: string } | null {
  if (prop.startsWith('properties.')) {
    return { jsonColumn: 'properties', key: escapeJsonKey(prop.slice('properties.'.length)) };
  }
  if (prop.startsWith('user_properties.')) {
    return { jsonColumn: 'user_properties', key: escapeJsonKey(prop.slice('user_properties.'.length)) };
  }
  return null;
}

export function resolvePropertyExpr(prop: string): string {
  const source = resolvePropertySource(prop);
  if (source) return `JSONExtractString(${source.jsonColumn}, '${source.key}')`;
  if (DIRECT_COLUMNS.has(prop)) return prop;
  throw new AppBadRequestException(`Unknown filter property: ${prop}`);
}

export function resolveNumericPropertyExpr(prop: string): string {
  const source = resolvePropertySource(prop);
  if (source) return `toFloat64OrZero(JSONExtractRaw(${source.jsonColumn}, '${source.key}'))`;
  throw new AppBadRequestException(`Unknown metric property: ${prop}`);
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
    const source = resolvePropertySource(f.property);
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
        queryParams[pk] = `%${escapeLikePattern(f.value ?? '')}%`;
        parts.push(`${expr} LIKE {${pk}:String}`);
        break;
      case 'not_contains':
        queryParams[pk] = `%${escapeLikePattern(f.value ?? '')}%`;
        parts.push(`${expr} NOT LIKE {${pk}:String}`);
        break;
      case 'is_set':
        // For JSON columns use JSONHas() so that boolean false and 0 are treated as set.
        // For direct columns (plain String) fall back to != '' check.
        if (source) {
          parts.push(`JSONHas(${source.jsonColumn}, '${source.key}')`);
        } else {
          parts.push(`${expr} != ''`);
        }
        break;
      case 'is_not_set':
        // For JSON columns use NOT JSONHas() so that boolean false and 0 are not treated as unset.
        // For direct columns (plain String) fall back to = '' check.
        if (source) {
          parts.push(`NOT JSONHas(${source.jsonColumn}, '${source.key}')`);
        } else {
          parts.push(`${expr} = ''`);
        }
        break;
      default: {
        const _exhaustive: never = f.operator;
        throw new Error(`Unhandled operator: ${_exhaustive}`);
      }
    }
  }
  return parts;
}
