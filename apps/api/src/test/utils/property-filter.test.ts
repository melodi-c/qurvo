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
});

describe('resolveNumericPropertyExpr', () => {
  it('resolves properties.* to toFloat64OrZero(JSONExtractRaw)', () => {
    expect(resolveNumericPropertyExpr('properties.price')).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'price'))");
  });

  it('resolves user_properties.* to toFloat64OrZero(JSONExtractRaw)', () => {
    expect(resolveNumericPropertyExpr('user_properties.age')).toBe("toFloat64OrZero(JSONExtractRaw(user_properties, 'age'))");
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

  it('builds eq condition', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'event_name', operator: 'eq', value: 'page_view' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(['event_name = {p_f0_v:String}']);
    expect(params['p_f0_v']).toBe('page_view');
  });

  it('builds neq condition', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'country', operator: 'neq', value: 'US' },
    ];
    const result = buildPropertyFilterConditions(filters, 'q', params);
    expect(result).toEqual(['country != {q_f0_v:String}']);
    expect(params['q_f0_v']).toBe('US');
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

  it('builds not_contains condition', () => {
    const params: Record<string, unknown> = {};
    const filters: PropertyFilter[] = [
      { property: 'url', operator: 'not_contains', value: 'admin' },
    ];
    const result = buildPropertyFilterConditions(filters, 'p', params);
    expect(result).toEqual(['url NOT LIKE {p_f0_v:String}']);
    expect(params['p_f0_v']).toBe('%admin%');
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
