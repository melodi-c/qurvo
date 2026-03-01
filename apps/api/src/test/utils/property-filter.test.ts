import { describe, it, expect } from 'vitest';
import { compileExprToSql } from '@qurvo/ch-query';
import {
  propertyFilter,
  propertyFilters,
  resolvePropertyExpr,
  resolveNumericPropertyExpr,
  type PropertyFilter,
} from '../../analytics/query-helpers';

/** Compile an Expr to SQL string for assertions. */
function exprSql(expr: ReturnType<typeof propertyFilter>): string {
  return compileExprToSql(expr).sql;
}

describe('resolvePropertyExpr', () => {
  it('resolves properties.* to JSONExtractString', () => {
    expect(exprSql(resolvePropertyExpr('properties.plan'))).toBe("JSONExtractString(properties, 'plan')");
  });

  it('resolves user_properties.* to JSONExtractString', () => {
    expect(exprSql(resolvePropertyExpr('user_properties.email'))).toBe("JSONExtractString(user_properties, 'email')");
  });

  it('resolves nested dot-notation to variadic JSONExtractString', () => {
    expect(exprSql(resolvePropertyExpr('properties.address.city'))).toBe(
      "JSONExtractString(properties, 'address', 'city')",
    );
    expect(exprSql(resolvePropertyExpr('user_properties.location.country.code'))).toBe(
      "JSONExtractString(user_properties, 'location', 'country', 'code')",
    );
  });

  it('resolves direct column name as-is', () => {
    expect(exprSql(resolvePropertyExpr('event_name'))).toBe('event_name');
    expect(exprSql(resolvePropertyExpr('country'))).toBe('country');
    expect(exprSql(resolvePropertyExpr('browser'))).toBe('browser');
  });

  it('throws for unknown property', () => {
    expect(() => resolvePropertyExpr('unknown_column')).toThrow('Unknown filter property: unknown_column');
  });

  it('rejects single quotes in property key (SAFE_JSON_KEY_REGEX validation)', () => {
    expect(() => resolvePropertyExpr("properties.user's_plan")).toThrow('Invalid JSON key segment');
  });

  it('rejects backslash in property key (SAFE_JSON_KEY_REGEX validation)', () => {
    expect(() => resolvePropertyExpr('properties.foo\\')).toThrow('Invalid JSON key segment');
  });

  it('rejects backslash+quote in property key (SQL injection prevention)', () => {
    expect(() => resolvePropertyExpr("properties.foo\\'")).toThrow('Invalid JSON key segment');
  });

  it('rejects single quotes in nested path segments (SAFE_JSON_KEY_REGEX validation)', () => {
    expect(() => resolvePropertyExpr("properties.a's.b")).toThrow('Invalid JSON key segment');
  });
});

describe('resolveNumericPropertyExpr', () => {
  it('resolves properties.* to toFloat64OrZero(JSONExtractRaw)', () => {
    expect(exprSql(resolveNumericPropertyExpr('properties.price'))).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'price'))");
  });

  it('resolves user_properties.* to toFloat64OrZero(JSONExtractRaw)', () => {
    expect(exprSql(resolveNumericPropertyExpr('user_properties.age'))).toBe("toFloat64OrZero(JSONExtractRaw(user_properties, 'age'))");
  });

  it('resolves nested dot-notation numeric to variadic JSONExtractRaw', () => {
    expect(exprSql(resolveNumericPropertyExpr('properties.meta.price'))).toBe(
      "toFloat64OrZero(JSONExtractRaw(properties, 'meta', 'price'))",
    );
  });

  it('throws for direct columns (not allowed as numeric)', () => {
    expect(() => resolveNumericPropertyExpr('event_name')).toThrow('Unknown metric property: event_name');
  });

  it('throws for unknown property', () => {
    expect(() => resolveNumericPropertyExpr('unknown')).toThrow('Unknown metric property: unknown');
  });
});

describe('propertyFilter', () => {
  it('builds eq condition for direct column', () => {
    const f: PropertyFilter = { property: 'event_name', operator: 'eq', value: 'page_view' };
    const { sql, params } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain('event_name =');
    expect(sql).toContain(':String}');
    const paramKey = Object.keys(params).find(k => params[k] === 'page_view');
    expect(paramKey).toBeDefined();
  });

  it('builds eq condition for JSON property with boolean/number OR fallback', () => {
    const f: PropertyFilter = { property: 'properties.active', operator: 'eq', value: 'true' };
    const { sql, params } = compileExprToSql(propertyFilter(f));
    // Verifies OR pattern: JSONExtractString = param OR toString(JSONExtractRaw) = param
    expect(sql).toContain("JSONExtractString(properties, 'active')");
    expect(sql).toContain(' OR ');
    expect(sql).toContain("toString(JSONExtractRaw(properties, 'active'))");
    const paramKey = Object.keys(params).find(k => params[k] === 'true');
    expect(paramKey).toBeDefined();
  });

  it('builds neq condition for direct column (no JSONHas guard)', () => {
    const f: PropertyFilter = { property: 'country', operator: 'neq', value: 'US' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain('country !=');
    expect(sql).toContain(':String}');
    expect(sql).not.toContain('JSONHas');
  });

  it('builds neq condition for JSON property with JSONHas guard', () => {
    const f: PropertyFilter = { property: 'properties.plan', operator: 'neq', value: 'pro' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONHas(properties, 'plan')");
    expect(sql).toContain("JSONExtractString(properties, 'plan')");
    expect(sql).toContain("toString(JSONExtractRaw(properties, 'plan'))");
  });

  it('builds contains condition with LIKE', () => {
    const f: PropertyFilter = { property: 'page_title', operator: 'contains', value: 'home' };
    const { sql, params } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain('page_title LIKE');
    expect(sql).toContain(':String}');
    const paramKey = Object.keys(params).find(k => params[k] === '%home%');
    expect(paramKey).toBeDefined();
  });

  it('escapes LIKE special chars in contains value', () => {
    const f: PropertyFilter = { property: 'page_path', operator: 'contains', value: '50%_off' };
    const { params } = compileExprToSql(propertyFilter(f));
    const paramKey = Object.keys(params).find(k => params[k] === '%50\\%\\_off%');
    expect(paramKey).toBeDefined();
  });

  it('builds not_contains condition for direct column (no JSONHas guard)', () => {
    const f: PropertyFilter = { property: 'url', operator: 'not_contains', value: 'admin' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain('url NOT LIKE');
    expect(sql).toContain(':String}');
    expect(sql).not.toContain('JSONHas');
  });

  it('builds not_contains condition for JSON property with JSONHas guard', () => {
    const f: PropertyFilter = { property: 'properties.plan', operator: 'not_contains', value: 'pro' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONHas(properties, 'plan')");
    expect(sql).toContain('NOT LIKE');
  });

  it('builds is_set condition for JSON property using JSONHas', () => {
    const f: PropertyFilter = { property: 'properties.plan', operator: 'is_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("JSONHas(properties, 'plan')");
  });

  it('builds is_set condition for direct column using != empty string', () => {
    const f: PropertyFilter = { property: 'country', operator: 'is_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("country != ''");
  });

  it('builds is_not_set condition for JSON property using NOT JSONHas', () => {
    const f: PropertyFilter = { property: 'user_properties.email', operator: 'is_not_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("NOT JSONHas(user_properties, 'email')");
  });

  it('builds is_not_set condition for direct column using = empty string', () => {
    const f: PropertyFilter = { property: 'browser', operator: 'is_not_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("browser = ''");
  });

  it('rejects backslash in is_set JSON key (SAFE_JSON_KEY_REGEX validation)', () => {
    const f: PropertyFilter = { property: 'properties.foo\\', operator: 'is_set' };
    expect(() => propertyFilter(f)).toThrow('Invalid JSON key segment');
  });

  it('rejects backslash+quote in is_not_set JSON key (SQL injection prevention)', () => {
    const f: PropertyFilter = { property: "properties.foo\\'", operator: 'is_not_set' };
    expect(() => propertyFilter(f)).toThrow('Invalid JSON key segment');
  });

  it('throws for unknown operator', () => {
    const f = { property: 'event_name', operator: 'like' as never, value: 'test' };
    expect(() => propertyFilter(f)).toThrow('Unhandled operator: like');
  });

  it('throws for unknown property', () => {
    const f: PropertyFilter = { property: 'nonexistent_column', operator: 'eq', value: 'val' };
    expect(() => propertyFilter(f)).toThrow('Unknown filter property: nonexistent_column');
  });
});

describe('propertyFilters', () => {
  it('returns undefined for empty array', () => {
    expect(propertyFilters([])).toBeUndefined();
  });

  it('combines multiple filters with AND', () => {
    const filters: PropertyFilter[] = [
      { property: 'event_name', operator: 'eq', value: 'click' },
      { property: 'country', operator: 'neq', value: 'GB' },
    ];
    const expr = propertyFilters(filters);
    expect(expr).toBeDefined();
    const { sql } = compileExprToSql(expr!);
    expect(sql).toContain('event_name =');
    expect(sql).toContain('country !=');
    expect(sql).toContain(' AND ');
  });
});

// ── Nested dot-notation (a.b) path tests ─────────────────────────────────────
describe('propertyFilter — nested dot-notation paths', () => {
  it('eq on nested path uses variadic JSONExtractString with boolean/number OR fallback', () => {
    const f: PropertyFilter = { property: 'properties.address.city', operator: 'eq', value: 'Moscow' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONExtractString(properties, 'address', 'city')");
    expect(sql).toContain(' OR ');
    expect(sql).toContain("toString(JSONExtractRaw(properties, 'address', 'city'))");
  });

  it('neq on nested path uses variadic JSONHas guard', () => {
    const f: PropertyFilter = { property: 'properties.address.city', operator: 'neq', value: 'London' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONHas(properties, 'address', 'city')");
    expect(sql).toContain("JSONExtractString(properties, 'address', 'city')");
  });

  it('is_set on nested path uses variadic JSONHas', () => {
    const f: PropertyFilter = { property: 'user_properties.location.country', operator: 'is_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("JSONHas(user_properties, 'location', 'country')");
  });

  it('properties.address.city is_set generates variadic JSONHas(properties, address, city)', () => {
    const f: PropertyFilter = { property: 'properties.address.city', operator: 'is_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("JSONHas(properties, 'address', 'city')");
  });

  it('properties.city is_set (flat key) generates plain JSONHas(properties, city)', () => {
    const f: PropertyFilter = { property: 'properties.city', operator: 'is_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("JSONHas(properties, 'city')");
  });

  it('is_not_set on nested path uses variadic NOT JSONHas', () => {
    const f: PropertyFilter = { property: 'properties.meta.score', operator: 'is_not_set' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toBe("NOT JSONHas(properties, 'meta', 'score')");
  });

  it('contains on nested path uses variadic JSONExtractString', () => {
    const f: PropertyFilter = { property: 'properties.address.city', operator: 'contains', value: 'osc' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONExtractString(properties, 'address', 'city')");
    expect(sql).toContain('LIKE');
  });

  it('not_contains on nested path uses variadic JSONHas guard', () => {
    const f: PropertyFilter = { property: 'properties.address.city', operator: 'not_contains', value: 'osc' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONHas(properties, 'address', 'city')");
    expect(sql).toContain('NOT LIKE');
  });

  it('three-level nested path works correctly', () => {
    const f: PropertyFilter = { property: 'properties.a.b.c', operator: 'eq', value: 'val' };
    const { sql } = compileExprToSql(propertyFilter(f));
    expect(sql).toContain("JSONExtractString(properties, 'a', 'b', 'c')");
    expect(sql).toContain("toString(JSONExtractRaw(properties, 'a', 'b', 'c'))");
  });
});
