import { describe, it, expect } from 'vitest';
import {
  resolvePropertyExpr,
  resolveEventPropertyExpr,
  applyOperator,
  validateJsonKey,
  escapeJsonKey,
  parsePropertyPath,
  resolvedPerson,
  DIRECT_COLUMNS,
  TOP_LEVEL_COLUMNS,
} from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';

/** Helper to compile an Expr to its SQL string. */
function sql(expr: ReturnType<typeof resolvePropertyExpr>): string {
  return compileExprToSql(expr).sql;
}

/** Helper to compile an Expr and return its params. */
function params(expr: ReturnType<typeof resolvePropertyExpr>): Record<string, unknown> {
  return compileExprToSql(expr).params;
}

describe('validateJsonKey', () => {
  it('accepts alphanumeric key', () => {
    expect(() => validateJsonKey('plan')).not.toThrow();
  });

  it('accepts key with underscores, hyphens, dots', () => {
    expect(() => validateJsonKey('my-key_2.nested')).not.toThrow();
  });

  it('rejects key with single quote (SQL injection risk)', () => {
    expect(() => validateJsonKey("user's_key")).toThrow('Invalid JSON key segment');
  });

  it('rejects key with backslash', () => {
    expect(() => validateJsonKey('foo\\')).toThrow('Invalid JSON key segment');
  });

  it('rejects key with newline', () => {
    expect(() => validateJsonKey('foo\nbar')).toThrow('Invalid JSON key segment');
  });

  it('rejects key with tab', () => {
    expect(() => validateJsonKey('foo\tbar')).toThrow('Invalid JSON key segment');
  });

  it('rejects key with null byte', () => {
    expect(() => validateJsonKey('foo\0bar')).toThrow('Invalid JSON key segment');
  });

  it('rejects key with carriage return', () => {
    expect(() => validateJsonKey('foo\rbar')).toThrow('Invalid JSON key segment');
  });

  it('rejects empty string', () => {
    expect(() => validateJsonKey('')).toThrow('Invalid JSON key segment');
  });
});

describe('escapeJsonKey', () => {
  it('returns safe key unchanged', () => {
    expect(escapeJsonKey('my_key')).toBe('my_key');
  });

  it('accepts key with hyphens and dots', () => {
    expect(escapeJsonKey('my-key.nested')).toBe('my-key.nested');
  });

  it('rejects unsafe characters', () => {
    expect(() => escapeJsonKey("user's_key")).toThrow('Invalid JSON key segment');
    expect(() => escapeJsonKey('foo\\')).toThrow('Invalid JSON key segment');
  });
});

describe('parsePropertyPath', () => {
  it('parses properties.* path', () => {
    expect(parsePropertyPath('properties.plan')).toEqual({
      jsonColumn: 'properties',
      segments: ['plan'],
    });
  });

  it('parses nested properties path', () => {
    expect(parsePropertyPath('properties.foo.bar')).toEqual({
      jsonColumn: 'properties',
      segments: ['foo', 'bar'],
    });
  });

  it('parses user_properties.* path', () => {
    expect(parsePropertyPath('user_properties.email')).toEqual({
      jsonColumn: 'user_properties',
      segments: ['email'],
    });
  });

  it('returns null for direct columns', () => {
    expect(parsePropertyPath('country')).toBeNull();
  });

  it('returns null for unknown prefix', () => {
    expect(parsePropertyPath('event_name')).toBeNull();
  });
});

describe('resolvedPerson', () => {
  it('returns the coalesce+dictGetOrNull expression', () => {
    const expr = resolvedPerson();
    const compiled = compileExprToSql(expr).sql;
    expect(compiled).toContain('dictGetOrNull');
    expect(compiled).toContain('person_id');
    expect(compiled).toContain('coalesce');
  });

  it('supports .as() alias', () => {
    const expr = resolvedPerson().as('pid');
    const compiled = compileExprToSql(expr).sql;
    expect(compiled).toContain('AS pid');
  });
});

describe('DIRECT_COLUMNS and TOP_LEVEL_COLUMNS', () => {
  it('TOP_LEVEL_COLUMNS is a subset of DIRECT_COLUMNS', () => {
    for (const col of TOP_LEVEL_COLUMNS) {
      expect(DIRECT_COLUMNS.has(col)).toBe(true);
    }
  });

  it('DIRECT_COLUMNS contains event-specific columns', () => {
    expect(DIRECT_COLUMNS.has('event_name')).toBe(true);
    expect(DIRECT_COLUMNS.has('url')).toBe(true);
    expect(DIRECT_COLUMNS.has('referrer')).toBe(true);
  });
});

describe('resolvePropertyExpr (cohort-query helpers)', () => {
  it('resolves top-level column with argMax', () => {
    expect(sql(resolvePropertyExpr('country'))).toBe('argMax(country, timestamp)');
  });

  it('resolves properties.* to JSONExtractString with argMax', () => {
    expect(sql(resolvePropertyExpr('properties.plan'))).toBe("JSONExtractString(argMax(properties, timestamp), 'plan')");
  });

  it('resolves user_properties.* to JSONExtractString with argMax', () => {
    expect(sql(resolvePropertyExpr('user_properties.email'))).toBe("JSONExtractString(argMax(user_properties, timestamp), 'email')");
  });

  it('resolves nested properties with multiple keys', () => {
    expect(sql(resolvePropertyExpr('properties.foo.bar'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo', 'bar')",
    );
  });

  it('rejects unsafe characters in property keys (security validation)', () => {
    expect(() => resolvePropertyExpr("properties.user's_key")).toThrow('Invalid JSON key segment');
    expect(() => resolvePropertyExpr('properties.foo\\')).toThrow('Invalid JSON key segment');
    expect(() => resolvePropertyExpr('properties.foo\nbar')).toThrow('Invalid JSON key segment');
    expect(() => resolvePropertyExpr('properties.foo\rbar')).toThrow('Invalid JSON key segment');
    expect(() => resolvePropertyExpr('properties.foo\tbar')).toThrow('Invalid JSON key segment');
    expect(() => resolvePropertyExpr('properties.foo\0bar')).toThrow('Invalid JSON key segment');
  });
});

describe('resolveEventPropertyExpr (cohort-query helpers)', () => {
  it('resolves top-level column directly', () => {
    expect(sql(resolveEventPropertyExpr('country'))).toBe('country');
  });

  it('resolves properties.* to JSONExtractString', () => {
    expect(sql(resolveEventPropertyExpr('properties.plan'))).toBe("JSONExtractString(properties, 'plan')");
  });

  it('resolves nested properties with multiple keys', () => {
    expect(sql(resolveEventPropertyExpr('properties.foo.bar'))).toBe(
      "JSONExtractString(properties, 'foo', 'bar')",
    );
  });

  it('rejects unsafe characters in property keys (security validation)', () => {
    expect(() => resolveEventPropertyExpr("user_properties.foo\\'")).toThrow('Invalid JSON key segment');
    expect(() => resolveEventPropertyExpr('properties.foo\nbar')).toThrow('Invalid JSON key segment');
    expect(() => resolveEventPropertyExpr('properties.key\twith\ttabs')).toThrow('Invalid JSON key segment');
  });
});

describe('applyOperator — typed Expr path (func/column inputs)', () => {
  it('eq: uses OR with JSONExtractRaw when expr is JSONExtractString', () => {
    const expr = resolvePropertyExpr('user_properties.is_premium');
    const result = applyOperator(expr, 'eq', 'p0', 'true');
    // Pure AST: or() doesn't add outer parens at top-level
    expect(sql(result)).toBe(
      "JSONExtractString(argMax(user_properties, timestamp), 'is_premium') = {p0:String} OR toString(JSONExtractRaw(argMax(user_properties, timestamp), 'is_premium')) = {p0:String}",
    );
    expect(params(result)['p0']).toBe('true');
  });

  it('eq: does NOT add OR fallback for top-level column (argMax)', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'eq', 'p0', 'US');
    expect(sql(result)).toBe('argMax(country, timestamp) = {p0:String}');
    expect(params(result)['p0']).toBe('US');
  });

  it('neq: uses JSONHas guard AND with JSONExtractRaw when expr is JSONExtractString', () => {
    const expr = resolvePropertyExpr('properties.active');
    const result = applyOperator(expr, 'neq', 'p0', 'false');
    expect(sql(result)).toBe(
      "JSONHas(argMax(properties, timestamp), 'active') AND JSONExtractString(argMax(properties, timestamp), 'active') != {p0:String} AND toString(JSONExtractRaw(argMax(properties, timestamp), 'active')) != {p0:String}",
    );
    expect(params(result)['p0']).toBe('false');
  });

  it('neq: does NOT add AND guard for top-level column', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'neq', 'p0', 'US');
    expect(sql(result)).toBe('argMax(country, timestamp) != {p0:String}');
    expect(params(result)['p0']).toBe('US');
  });

  it('gt: uses JSONExtractRaw for JSON properties', () => {
    const expr = resolvePropertyExpr('user_properties.price');
    const result = applyOperator(expr, 'gt', 'p0', '10');
    expect(sql(result)).toBe(
      "toFloat64OrZero(JSONExtractRaw(argMax(user_properties, timestamp), 'price')) > {p0:Float64}",
    );
    expect(params(result)['p0']).toBe(10);
  });

  it('lt: uses JSONExtractRaw for event-level properties', () => {
    const expr = resolveEventPropertyExpr('properties.count');
    const result = applyOperator(expr, 'lt', 'p0', '5');
    expect(sql(result)).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'count')) < {p0:Float64}");
    expect(params(result)['p0']).toBe(5);
  });

  it('gte: uses JSONExtractRaw for JSON properties', () => {
    const expr = resolveEventPropertyExpr('properties.score');
    const result = applyOperator(expr, 'gte', 'p0', '5');
    expect(sql(result)).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'score')) >= {p0:Float64}");
  });

  it('lte: uses JSONExtractRaw for JSON properties', () => {
    const expr = resolveEventPropertyExpr('properties.amount');
    const result = applyOperator(expr, 'lte', 'p0', '100');
    expect(sql(result)).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'amount')) <= {p0:Float64}");
  });

  it('between: uses JSONExtractRaw for JSON properties', () => {
    const expr = resolveEventPropertyExpr('properties.price');
    const result = applyOperator(expr, 'between', 'p0', undefined, ['10', '50']);
    expect(sql(result)).toBe(
      "toFloat64OrZero(JSONExtractRaw(properties, 'price')) >= {p0_min:Float64} AND toFloat64OrZero(JSONExtractRaw(properties, 'price')) <= {p0_max:Float64}",
    );
    expect(params(result)['p0_min']).toBe(10);
    expect(params(result)['p0_max']).toBe(50);
  });

  it('not_between: uses JSONExtractRaw for JSON properties', () => {
    const expr = resolveEventPropertyExpr('properties.age');
    const result = applyOperator(expr, 'not_between', 'p0', undefined, ['18', '65']);
    // Pure AST: or() doesn't add outer parens at top-level
    expect(sql(result)).toBe(
      "toFloat64OrZero(JSONExtractRaw(properties, 'age')) < {p0_min:Float64} OR toFloat64OrZero(JSONExtractRaw(properties, 'age')) > {p0_max:Float64}",
    );
  });

  it('gt: does NOT replace non-JSON expressions (top-level column)', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'gt', 'p0', '0');
    expect(sql(result)).toBe('toFloat64OrZero(argMax(country, timestamp)) > {p0:Float64}');
  });

  it('is_set: uses JSONHas for JSON properties', () => {
    const expr = resolvePropertyExpr('user_properties.active');
    const result = applyOperator(expr, 'is_set', 'p0');
    expect(sql(result)).toBe("JSONHas(argMax(user_properties, timestamp), 'active')");
    expect(Object.keys(params(result))).toHaveLength(0);
  });

  it('is_not_set: uses NOT JSONHas for JSON properties', () => {
    const expr = resolvePropertyExpr('user_properties.active');
    const result = applyOperator(expr, 'is_not_set', 'p0');
    expect(sql(result)).toBe("NOT JSONHas(argMax(user_properties, timestamp), 'active')");
    expect(Object.keys(params(result))).toHaveLength(0);
  });

  it('is_set: uses JSONHas for event properties JSON expression', () => {
    const expr = resolveEventPropertyExpr('properties.score');
    const result = applyOperator(expr, 'is_set', 'p0');
    expect(sql(result)).toBe("JSONHas(properties, 'score')");
  });

  it('is_not_set: uses NOT JSONHas for event properties JSON expression', () => {
    const expr = resolveEventPropertyExpr('properties.score');
    const result = applyOperator(expr, 'is_not_set', 'p0');
    expect(sql(result)).toBe("NOT JSONHas(properties, 'score')");
  });

  it('is_set: falls back to != empty for top-level column', () => {
    const result = applyOperator(resolvePropertyExpr('country'), 'is_set', 'p0');
    expect(sql(result)).toBe("argMax(country, timestamp) != ''");
  });

  it('is_not_set: falls back to = empty for top-level column', () => {
    const result = applyOperator(resolvePropertyExpr('country'), 'is_not_set', 'p0');
    expect(sql(result)).toBe("argMax(country, timestamp) = ''");
  });

  it('contains: escapes % in value', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'contains', 'p0', 'a%b');
    expect(sql(result)).toContain('LIKE');
    expect(params(result)['p0']).toBe('%a\\%b%');
  });

  it('not_contains: escapes % in value', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'not_contains', 'p0', 'x%y');
    expect(sql(result)).toContain('NOT LIKE');
    expect(params(result)['p0']).toBe('%x\\%y%');
  });

  it('in: produces IN clause', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'in', 'p0', undefined, ['US', 'CA']);
    expect(sql(result)).toBe('argMax(country, timestamp) IN ({p0:Array(String)})');
    expect(params(result)['p0']).toEqual(['US', 'CA']);
  });

  it('not_in: produces NOT IN clause', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'not_in', 'p0', undefined, ['RU', 'CN']);
    expect(sql(result)).toBe('argMax(country, timestamp) NOT IN ({p0:Array(String)})');
    expect(params(result)['p0']).toEqual(['RU', 'CN']);
  });

  it('regex: produces match() call', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'regex', 'p0', '^US.*');
    expect(sql(result)).toBe('match(argMax(country, timestamp), {p0:String})');
    expect(params(result)['p0']).toBe('^US.*');
  });

  it('not_regex: produces NOT match() call', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'not_regex', 'p0', '^(test|demo)');
    expect(sql(result)).toBe('NOT match(argMax(country, timestamp), {p0:String})');
    expect(params(result)['p0']).toBe('^(test|demo)');
  });

  it('contains_multi: produces multiSearchAny()', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'contains_multi', 'p0', undefined, ['North', 'South']);
    expect(sql(result)).toBe('multiSearchAny(argMax(country, timestamp), {p0:Array(String)})');
    expect(params(result)['p0']).toEqual(['North', 'South']);
  });

  it('not_contains_multi: produces NOT multiSearchAny()', () => {
    const expr = resolvePropertyExpr('country');
    const result = applyOperator(expr, 'not_contains_multi', 'p0', undefined, ['spam', 'bot']);
    expect(sql(result)).toBe('NOT multiSearchAny(argMax(country, timestamp), {p0:Array(String)})');
    expect(params(result)['p0']).toEqual(['spam', 'bot']);
  });
});

describe('applyOperator — date operators guard against empty value and epoch false positives', () => {
  it('is_date_before: returns always-false clause when value is empty string', () => {
    const result = applyOperator(resolvePropertyExpr('country'), 'is_date_before', 'p0');
    // literal(0) compiles to just "0"
    expect(sql(result)).toBe('0');
  });

  it('is_date_before: returns always-false clause when value is undefined', () => {
    const result = applyOperator(resolvePropertyExpr('country'), 'is_date_before', 'p0', undefined);
    expect(sql(result)).toBe('0');
  });

  it('is_date_after: returns always-false clause when value is empty string', () => {
    const result = applyOperator(resolvePropertyExpr('country'), 'is_date_after', 'p0', '');
    expect(sql(result)).toBe('0');
  });

  it('is_date_exact: returns always-false clause when value is empty string', () => {
    const result = applyOperator(resolvePropertyExpr('country'), 'is_date_exact', 'p0', '');
    expect(sql(result)).toBe('0');
  });

  it('is_date_before: generates typed AST with epoch exclusion guard when value is valid', () => {
    const expr = resolvePropertyExpr('user_properties.signup_date');
    const result = applyOperator(expr, 'is_date_before', 'p0', '2025-03-01');
    expect(params(result)['p0']).toBe('2025-03-01');
    expect(sql(result)).toContain('parseDateTimeBestEffortOrZero');
    expect(sql(result)).toContain('toDateTime(0)');
    expect(sql(result)).toContain('parseDateTimeBestEffort({p0:String})');
  });

  it('is_date_after: generates typed AST with epoch exclusion guard when value is valid', () => {
    const expr = resolvePropertyExpr('user_properties.signup_date');
    const result = applyOperator(expr, 'is_date_after', 'p0', '2025-03-01');
    expect(params(result)['p0']).toBe('2025-03-01');
    expect(sql(result)).toContain('parseDateTimeBestEffortOrZero');
    expect(sql(result)).toContain('>');
  });

  it('is_date_exact: generates typed AST with epoch exclusion guard when value is valid', () => {
    const expr = resolvePropertyExpr('user_properties.signup_date');
    const result = applyOperator(expr, 'is_date_exact', 'p0', '2025-03-15');
    expect(params(result)['p0']).toBe('2025-03-15');
    expect(sql(result)).toContain('toDate');
    expect(sql(result)).toContain('parseDateTimeBestEffort');
  });
});

describe('applyOperator — LIKE wildcard escaping', () => {
  it('contains: escapes % in value so it is treated as a literal', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'contains', 'p0', 'a%b');
    expect(params(result)['p0']).toBe('%a\\%b%');
  });

  it('contains: escapes _ in value so it is treated as a literal', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'contains', 'p0', 'a_b');
    expect(params(result)['p0']).toBe('%a\\_b%');
  });

  it('contains: escapes backslash in value', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'contains', 'p0', 'a\\b');
    expect(params(result)['p0']).toBe('%a\\\\b%');
  });

  it('contains: plain value without wildcards passes through unchanged (modulo wrapping %)', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'contains', 'p0', 'hello');
    expect(params(result)['p0']).toBe('%hello%');
  });

  it('not_contains: escapes % in value', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'not_contains', 'p0', 'x%y');
    expect(params(result)['p0']).toBe('%x\\%y%');
  });

  it('not_contains: escapes _ in value', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'not_contains', 'p0', 'x_y');
    expect(params(result)['p0']).toBe('%x\\_y%');
  });

  it('contains: empty value produces %% pattern (matches all)', () => {
    const expr = resolveEventPropertyExpr('properties.name');
    const result = applyOperator(expr, 'contains', 'p0', '');
    expect(params(result)['p0']).toBe('%%');
  });
});
