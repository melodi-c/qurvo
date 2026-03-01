import { sql, type SQL } from 'drizzle-orm';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { escapeLikePattern } from '@qurvo/ch-query';
import type { PropertyFilter } from '../analytics/query-helpers';

/**
 * Builds Drizzle SQL fragments for filtering on persons.properties JSONB.
 * Each filter targets persons.properties->>'key' (text extraction).
 */
export function buildPgPropertyFilterConditions(filters: PropertyFilter[]): SQL[] {
  const parts: SQL[] = [];
  for (const f of filters) {
    if (!/^\w+$/.test(f.property)) {
      throw new AppBadRequestException(`Invalid property name: ${f.property}`);
    }
    const keyExpr = sql`properties->>${f.property}`;

    switch (f.operator) {
      case 'eq':
        // Use @> containment operator for GIN index compatibility
        parts.push(sql`properties @> ${JSON.stringify({ [f.property]: f.value ?? '' })}::jsonb`);
        break;
      case 'neq':
        parts.push(sql`(${keyExpr} IS NULL OR ${keyExpr} != ${f.value ?? ''})`);
        break;
      case 'contains':
        parts.push(sql`${keyExpr} ILIKE ${'%' + escapeLikePattern(f.value ?? '') + '%'}`);
        break;
      case 'not_contains':
        parts.push(sql`(${keyExpr} IS NULL OR ${keyExpr} NOT ILIKE ${'%' + escapeLikePattern(f.value ?? '') + '%'})`);
        break;
      case 'is_set':
        parts.push(sql`${keyExpr} IS NOT NULL`);
        break;
      case 'is_not_set':
        parts.push(sql`${keyExpr} IS NULL`);
        break;
    }
  }
  return parts;
}
