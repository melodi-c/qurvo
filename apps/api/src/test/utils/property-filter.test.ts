import { describe, it, expect } from 'vitest';
import {
  buildPropertyFilterConditions,
  resolvePropertyExpr,
  resolveNumericPropertyExpr,
  type PropertyFilter,
} from '../../utils/property-filter';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

describe('resolvePropertyExpr', () => {
  it('resolves properties.* to JSONExtractString', () => {
    expect(resolvePropertyExpr('properties.plan')).toBe("JSONExtractString(properties, 'plan')");
  });

  it('resolves user_properties.* to JSONExtractString', () => {
    expect(resolvePropertyExpr('user_properties.email')).toBe("JSONExtractString(user_properties, 'email')");
  });

  it('resolves nested dot-notation to variadic JSONExtractString', () => {
    expect(resolvePropertyExpr('properties.address.city')).toBe(
      "JSONExtractString(properties, 'address', 'city')",
    );
    expect(resolvePropertyExpr('user_properties.location.country.code')).toBe(
      "JSONExtractString(user_properties, 'location', 'country', 'code')",
    );
  });

  it('resolves direct column name as-is', () => {
    expect(resolvePropertyExpr('event_name')).toBe('event_name');
    expect(resolvePropertyExpr('country')).toBe('country');
    expect(resolvePropertyExpr('browser')).toBe('browser');
  });

  it('throws for unknown property', () => {
    expect(() => resolvePropertyExpr('unknown_column')).toThrow(AppBadRequestException);
    expect(() => resolvePropertyExpr('unknown_column')).toThrow('Unknown filter property: unknown_column');
  });

  it('escapes single quotes in property key', () => {
    expect(resolvePropertyExpr("properties.user's_plan")).toBe("JSONExtractString(properties, 'user\\'s_plan')");
  });

  it('escapes backslash in property key before single quote escaping', () => {
    // key = "foo\\" → escaped → "foo\\\\"
    expect(resolvePropertyExpr('properties.foo\\')).toBe("JSONExtractString(properties, 'foo\\\\')");
  });

  it('escapes backslash followed by single quote (SQL injection vector)', () => {
    // key = "foo\\'" — without backslash escaping this would produce "foo\\'", breaking the SQL string.
    // With proper escaping: backslash → "\\\\", quote → "\\'", result: "foo\\\\\\'"
    expect(resolvePropertyExpr("properties.foo\\'")).toBe("JSONExtractString(properties, 'foo\\\\\\'')");
  });

  it('escapes single quotes in nested path segments individually', () => {
    expect(resolvePropertyExpr("properties.a's.b")).toBe(
      "JSONExtractString(properties, 'a\\'s', 'b')",
    );
  });
});

describe('resolveNumericPropertyExpr', () => {
  it('resolves properties.* to toFloat64OrZero(JSONExtractRaw)', () => {
    expect(resolveNumericPropertyExpr('properties.price')).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'price'))");
  });

  it('resolves user_properties.* to toFloat64OrZero(JSONExtractRaw)', () => {
    expect(resolveNumericPropertyExpr('user_properties.age')).toBe("toFloat64OrZero(JSONExtractRaw(user_properties, 'age'))");
  });

  it('resolves nested dot-notation numeric to chained JSONExtractRaw', () => {
    expect(resolveNumericPropertyExpr('properties.meta.price')).toBe(
      "toFloat64OrZero(JSONExtractRaw(JSONExtractRaw(properties, 'meta'), 'price'))",
    );
  });

  it('throws for direct columns (not allowed as numeric)', () => {
    expect(() => resolveNumericPropertyExpr('event_name')).toThrow(AppBadRequestException);
  });

  it('throws for unknown property', () => {
    expect(() => resolveNumericPropertyExpr('unknown')).toThrow(AppBadRequestException);
  });
});

describe('buildPropertyFilterConditions', () => {
  it('returns empty array for empty filters', () => {
    const params: Record<string, unknown> = {};
    const result = buildPropertyFilterConditions([], 'p', params);
    expect(result).toEqual([]);
    expect(params).toEqual({});
  });

  it('builds eq condition for direct column', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'event_name', operator: 'eq', value: 'page_view' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(['event_name = {p_f0_v:String}']);
    expect(params['p_f0_v']).toBe('page_view');
  });

  it('builds eq condition for JSON property with boolean/number OR fallback', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.active', operator: 'eq', value: 'true' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual([
      "(JSONExtractString(properties, 'active') = {p_f0_v:String} OR toString(JSONExtractRaw(properties, 'active')) = {p_f0_v:String})",
    ]);
    expect(params['p_f0_v']).toBe('true');
  });

  it('builds neq condition for direct column (no JSONHas guard)', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'country', operator: 'neq', value: 'US' },
    ];
    const result = buildPropertyFilterConditions(filters, 'q', params);
    expect(result).toEqual(['country != {q_f0_v:String}']);
    expect(params['q_f0_v']).toBe('US');
  });

  it('builds neq condition for JSON property with JSONHas guard and boolean/number AND condition', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.plan', operator: 'neq', value: 'pro' },
    ];
    const result = buildPropertyFilterConditions(filters, 'q', params);
    expect(result).toEqual([
      "JSONHas(properties, 'plan') AND (JSONExtractString(properties, 'plan') != {q_f0_v:String} AND toString(JSONExtractRaw(properties, 'plan')) != {q_f0_v:String})",
    ]);
    expect(params['q_f0_v']).toBe('pro');
  });

  it('builds neq condition for user_properties JSON with JSONHas guard and boolean/number AND condition', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'user_properties.tier', operator: 'neq', value: 'free' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual([
      "JSONHas(user_properties, 'tier') AND (JSONExtractString(user_properties, 'tier') != {p_f0_v:String} AND toString(JSONExtractRaw(user_properties, 'tier')) != {p_f0_v:String})",
    ]);
    expect(params['p_f0_v']).toBe('free');
  });

  it('builds contains condition with escaped LIKE pattern', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'page_title', operator: 'contains', value: 'home' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(['page_title LIKE {p_f0_v:String}']);
    expect(params['p_f0_v']).toBe('%home%');
  });

  it('escapes LIKE special chars in contains value', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'page_path', operator: 'contains', value: '50%_off' },
    ];
    buildPropertyFilterConditions(filters, 'p', params);
    expect(params['p_f0_v']).toBe('%50\\%\\_off%');
  });

  it('builds not_contains condition for direct column (no JSONHas guard)', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'url', operator: 'not_contains', value: 'admin' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(['url NOT LIKE {p_f0_v:String}']);
    expect(params['p_f0_v']).toBe('%admin%');
  });

  it('builds not_contains condition for JSON property with JSONHas guard', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.plan', operator: 'not_contains', value: 'pro' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(properties, 'plan') AND JSONExtractString(properties, 'plan') NOT LIKE {p_f0_v:String}"]);
    expect(params['p_f0_v']).toBe('%pro%');
  });

  it('builds not_contains condition for user_properties JSON with JSONHas guard', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'user_properties.email', operator: 'not_contains', value: 'gmail' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(user_properties, 'email') AND JSONExtractString(user_properties, 'email') NOT LIKE {p_f0_v:String}"]);
    expect(params['p_f0_v']).toBe('%gmail%');
  });

  it('builds is_set condition for JSON property using JSONHas', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.plan', operator: 'is_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(properties, 'plan')"]);
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('escapes backslash in is_set JSON key', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.foo\\', operator: 'is_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(properties, 'foo\\\\')"]);
  });

  it('escapes backslash+quote in is_not_set JSON key (SQL injection vector)', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: "properties.foo\\'", operator: 'is_not_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["NOT JSONHas(properties, 'foo\\\\\\'')"]); // backslash → \\\\, quote → \\'
  });

  it('builds is_set condition for direct column using != empty string', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'country', operator: 'is_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["country != ''"]);
  });

  it('builds is_not_set condition for JSON property using NOT JSONHas', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'user_properties.email', operator: 'is_not_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["NOT JSONHas(user_properties, 'email')"]);
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('builds is_not_set condition for direct column using = empty string', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'browser', operator: 'is_not_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["browser = ''"]);
  });

  it('handles multiple filters and numbers params correctly with prefix index', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'event_name', operator: 'eq', value: 'click' },
      { property: 'country', operator: 'neq', value: 'GB' },
    ];
    const result = buildPropertyFilterConditions(filters, 'x', params);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('event_name = {x_f0_v:String}');
    expect(result[1]).toBe('country != {x_f1_v:String}');
    expect(params['x_f0_v']).toBe('click');
    expect(params['x_f1_v']).toBe('GB');
  });

  it('uses empty string when value is undefined for eq', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'event_name', operator: 'eq' },
    ];
    buildPropertyFilterConditions(filters, 'p', params);
    expect(params['p_f0_v']).toBe('');
  });

  it('throws for unknown operator', () => {
    const params: Record<string, unknown> = {};
    const filters = [
      { property: 'event_name', operator: 'like' as never, value: 'test' },
    ];
    expect(() => buildPropertyFilterConditions(filters, 'p', params)).toThrow('Unhandled operator: like');
  });

  it('throws for unknown property', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'nonexistent_column', operator: 'eq', value: 'val' },
    ];
    expect(() => buildPropertyFilterConditions(filters, 'p', params)).toThrow(AppBadRequestException);
  });
});

// ── Nested dot-notation (a.b) path tests ─────────────────────────────────────
describe('buildPropertyFilterConditions — nested dot-notation paths', () => {
  it('eq on nested path uses variadic JSONExtractString with boolean/number OR fallback', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.address.city', operator: 'eq', value: 'Moscow' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual([
      "(JSONExtractString(properties, 'address', 'city') = {p_f0_v:String} OR toString(JSONExtractRaw(JSONExtractRaw(properties, 'address'), 'city')) = {p_f0_v:String})",
    ]);
    expect(params['p_f0_v']).toBe('Moscow');
  });

  it('neq on nested path uses JSONHas parent traversal guard and boolean/number AND condition', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.address.city', operator: 'neq', value: 'London' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual([
      "JSONHas(JSONExtractRaw(properties, 'address'), 'city') AND (JSONExtractString(properties, 'address', 'city') != {p_f0_v:String} AND toString(JSONExtractRaw(JSONExtractRaw(properties, 'address'), 'city')) != {p_f0_v:String})",
    ]);
    expect(params['p_f0_v']).toBe('London');
  });

  it('is_set on nested path uses JSONHas with parent traversal', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'user_properties.location.country', operator: 'is_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(JSONExtractRaw(user_properties, 'location'), 'country')"]);
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('properties.address.city is_set generates JSONHas(JSONExtractRaw(properties, address), city)', () => {
    // Acceptance criteria: nested key with dot-notation must NOT use a literal dot key.
    // JSONHas(properties, 'address.city') would always return false in ClickHouse because
    // it looks for a top-level key named "address.city" (a string with a dot), not a nested path.
    // Correct form: JSONHas(JSONExtractRaw(properties, 'address'), 'city')
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.address.city', operator: 'is_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(JSONExtractRaw(properties, 'address'), 'city')"]);
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('properties.city is_set (flat key) generates plain JSONHas(properties, city)', () => {
    // Flat key must still use simple JSONHas without any JSONExtractRaw wrapping.
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.city', operator: 'is_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONHas(properties, 'city')"]);
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_not_set on nested path uses NOT JSONHas with parent traversal', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.meta.score', operator: 'is_not_set' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["NOT JSONHas(JSONExtractRaw(properties, 'meta'), 'score')"]);
  });

  it('contains on nested path uses variadic JSONExtractString', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.address.city', operator: 'contains', value: 'osc' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(["JSONExtractString(properties, 'address', 'city') LIKE {p_f0_v:String}"]);
    expect(params['p_f0_v']).toBe('%osc%');
  });

  it('not_contains on nested path uses JSONHas parent traversal guard', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.address.city', operator: 'not_contains', value: 'osc' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual([
      "JSONHas(JSONExtractRaw(properties, 'address'), 'city') AND JSONExtractString(properties, 'address', 'city') NOT LIKE {p_f0_v:String}",
    ]);
    expect(params['p_f0_v']).toBe('%osc%');
  });

  it('three-level nested path works correctly with boolean/number OR fallback', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'properties.a.b.c', operator: 'eq', value: 'val' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual([
      "(JSONExtractString(properties, 'a', 'b', 'c') = {p_f0_v:String} OR toString(JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(properties, 'a'), 'b'), 'c')) = {p_f0_v:String})",
    ]);
  });
});
