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
 * and the path segments. Returns null for direct columns.
 *
 * Dot notation in the key is interpreted as nested JSON path:
 *   'properties.address.city' → { jsonColumn: 'properties', segments: ['address', 'city'] }
 * Flat keys (no dot) produce a single-element segments array:
 *   'properties.plan' → { jsonColumn: 'properties', segments: ['plan'] }
 */
function escapeJsonKey(segment: string): string {
  return segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolvePropertySource(prop: string): { jsonColumn: string; segments: string[] } | null {
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
  // Split by '.' to support nested JSON paths (dot notation).
  // Each segment is escaped individually to prevent SQL injection.
  const segments = rawKey.split('.').map(escapeJsonKey);
  return { jsonColumn, segments };
}

/**
 * Builds a SQL fragment to extract a string value from a JSON column.
 * Supports nested paths via variadic JSONExtractString:
 *   segments = ['a'] → JSONExtractString(col, 'a')
 *   segments = ['a', 'b'] → JSONExtractString(col, 'a', 'b')
 */
function buildJsonExtractString(jsonColumn: string, segments: string[]): string {
  const args = segments.map((s) => `'${s}'`).join(', ');
  return `JSONExtractString(${jsonColumn}, ${args})`;
}

/**
 * Builds a SQL fragment to extract a raw JSON value from a JSON column.
 * For nested paths wraps all but the last segment in JSONExtractRaw calls.
 *   segments = ['price'] → JSONExtractRaw(col, 'price')
 *   segments = ['a', 'b'] → JSONExtractRaw(JSONExtractRaw(col, 'a'), 'b')
 */
function buildJsonExtractRaw(jsonColumn: string, segments: string[]): string {
  // JSONExtractRaw does not accept variadic path arguments in ClickHouse,
  // so for nested paths we chain the calls manually.
  let expr = jsonColumn;
  for (const seg of segments) {
    expr = `JSONExtractRaw(${expr}, '${seg}')`;
  }
  return expr;
}

/**
 * Builds a SQL fragment for JSONHas existence check.
 * For nested paths descends into the object with JSONExtractRaw before the final JSONHas:
 *   segments = ['plan'] → JSONHas(col, 'plan')
 *   segments = ['address', 'city'] → JSONHas(JSONExtractRaw(col, 'address'), 'city')
 */
function buildJsonHas(jsonColumn: string, segments: string[]): string {
  if (segments.length === 1) {
    return `JSONHas(${jsonColumn}, '${segments[0]}')`;
  }
  // Navigate to the parent object, then check the last key.
  const parentExpr = buildJsonExtractRaw(jsonColumn, segments.slice(0, -1));
  return `JSONHas(${parentExpr}, '${segments[segments.length - 1]}')`;
}

export function resolvePropertyExpr(prop: string): string {
  const source = resolvePropertySource(prop);
  if (source) return buildJsonExtractString(source.jsonColumn, source.segments);
  if (DIRECT_COLUMNS.has(prop)) return prop;
  throw new AppBadRequestException(`Unknown filter property: ${prop}`);
}

export function resolveNumericPropertyExpr(prop: string): string {
  const source = resolvePropertySource(prop);
  if (source) return `toFloat64OrZero(${buildJsonExtractRaw(source.jsonColumn, source.segments)})`;
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
        if (source) {
          // JSONExtractString returns '' for boolean/number JSON values (e.g. true, false, 42).
          // JSONExtractRaw returns the raw token ('true', 'false', '42').
          // OR-ing both ensures string values and boolean/number values are both matched.
          const rawEqExpr = buildJsonExtractRaw(source.jsonColumn, source.segments);
          parts.push(`(${expr} = {${pk}:String} OR toString(${rawEqExpr}) = {${pk}:String})`);
        } else {
          parts.push(`${expr} = {${pk}:String}`);
        }
        break;
      case 'neq':
        queryParams[pk] = f.value ?? '';
        if (source) {
          // For JSON properties: require the key to be present before comparing.
          // JSONExtractString returns '' for missing keys, so '' != 'target' would be true,
          // incorrectly including users who never had this property.
          // Also handle boolean/number values via JSONExtractRaw (AND both conditions must not match).
          const rawNeqExpr = buildJsonExtractRaw(source.jsonColumn, source.segments);
          parts.push(
            `${buildJsonHas(source.jsonColumn, source.segments)} AND (${expr} != {${pk}:String} AND toString(${rawNeqExpr}) != {${pk}:String})`,
          );
        } else {
          parts.push(`${expr} != {${pk}:String}`);
        }
        break;
      case 'contains':
        queryParams[pk] = `%${escapeLikePattern(f.value ?? '')}%`;
        parts.push(`${expr} LIKE {${pk}:String}`);
        break;
      case 'not_contains':
        queryParams[pk] = `%${escapeLikePattern(f.value ?? '')}%`;
        // For JSON properties: require the key to be present before comparing.
        // JSONExtractString returns '' for missing keys, so '' NOT LIKE '%target%' would be true,
        // incorrectly including users who never had this property.
        if (source) {
          parts.push(`${buildJsonHas(source.jsonColumn, source.segments)} AND ${expr} NOT LIKE {${pk}:String}`);
        } else {
          parts.push(`${expr} NOT LIKE {${pk}:String}`);
        }
        break;
      case 'is_set':
        // For JSON columns use JSONHas() so that boolean false and 0 are treated as set.
        // For direct columns (plain String) fall back to != '' check.
        if (source) {
          parts.push(buildJsonHas(source.jsonColumn, source.segments));
        } else {
          parts.push(`${expr} != ''`);
        }
        break;
      case 'is_not_set':
        // For JSON columns use NOT JSONHas() so that boolean false and 0 are not treated as unset.
        // For direct columns (plain String) fall back to = '' check.
        if (source) {
          parts.push(`NOT ${buildJsonHas(source.jsonColumn, source.segments)}`);
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
