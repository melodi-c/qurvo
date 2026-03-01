import { describe, it, expect } from 'vitest';
import {
  resolvePropertyExpr,
  resolveEventPropertyExpr,
  buildOperatorClause,
  validateJsonKey,
  escapeJsonKey,
  parsePropertyPath,
  resolvedPerson,
  DIRECT_COLUMNS,
  TOP_LEVEL_COLUMNS,
} from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';
import { raw } from '@qurvo/ch-query';

/** Helper to compile an Expr to its SQL string. */
function sql(expr: ReturnType<typeof resolvePropertyExpr>): string {
  return compileExprToSql(expr).sql;
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

describe('buildOperatorClause — typed Expr path (func/column inputs)', () => {
  it('eq: uses OR with JSONExtractRaw when expr is JSONExtractString', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('user_properties.is_premium');
    const clause = sql(buildOperatorClause(expr, 'eq', 'p0', params, 'true'));
    expect(clause).toBe(
      "(JSONExtractString(argMax(user_properties, timestamp), 'is_premium') = {p0:String} OR toString(JSONExtractRaw(argMax(user_properties, timestamp), 'is_premium')) = {p0:String})",
    );
    expect(params['p0']).toBe('true');
  });

  it('eq: does NOT add OR fallback for top-level column (argMax)', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('country');
    const clause = sql(buildOperatorClause(expr, 'eq', 'p0', params, 'US'));
    expect(clause).toBe('argMax(country, timestamp) = {p0:String}');
    expect(params['p0']).toBe('US');
  });

  it('neq: uses JSONHas guard AND with JSONExtractRaw when expr is JSONExtractString', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('properties.active');
    const clause = sql(buildOperatorClause(expr, 'neq', 'p0', params, 'false'));
    expect(clause).toBe(
      "(JSONHas(argMax(properties, timestamp), 'active') AND JSONExtractString(argMax(properties, timestamp), 'active') != {p0:String} AND toString(JSONExtractRaw(argMax(properties, timestamp), 'active')) != {p0:String})",
    );
    expect(params['p0']).toBe('false');
  });

  it('neq: does NOT add AND guard for top-level column', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('country');
    const clause = sql(buildOperatorClause(expr, 'neq', 'p0', params, 'US'));
    expect(clause).toBe('argMax(country, timestamp) != {p0:String}');
    expect(params['p0']).toBe('US');
  });

  it('gt: uses JSONExtractRaw for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('user_properties.price');
    const clause = sql(buildOperatorClause(expr, 'gt', 'p0', params, '10'));
    expect(clause).toBe(
      "toFloat64OrZero(JSONExtractRaw(argMax(user_properties, timestamp), 'price')) > {p0:Float64}",
    );
    expect(params['p0']).toBe(10);
  });

  it('lt: uses JSONExtractRaw for event-level properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.count');
    const clause = sql(buildOperatorClause(expr, 'lt', 'p0', params, '5'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'count')) < {p0:Float64}");
    expect(params['p0']).toBe(5);
  });

  it('gte: uses JSONExtractRaw for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.score');
    const clause = sql(buildOperatorClause(expr, 'gte', 'p0', params, '5'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'score')) >= {p0:Float64}");
  });

  it('lte: uses JSONExtractRaw for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.amount');
    const clause = sql(buildOperatorClause(expr, 'lte', 'p0', params, '100'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'amount')) <= {p0:Float64}");
  });

  it('between: uses JSONExtractRaw for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.price');
    const clause = sql(buildOperatorClause(expr, 'between', 'p0', params, undefined, ['10', '50']));
    expect(clause).toBe(
      "toFloat64OrZero(JSONExtractRaw(properties, 'price')) >= {p0_min:Float64} AND toFloat64OrZero(JSONExtractRaw(properties, 'price')) <= {p0_max:Float64}",
    );
    expect(params['p0_min']).toBe(10);
    expect(params['p0_max']).toBe(50);
  });

  it('not_between: uses JSONExtractRaw for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.age');
    const clause = sql(buildOperatorClause(expr, 'not_between', 'p0', params, undefined, ['18', '65']));
    expect(clause).toBe(
      "(toFloat64OrZero(JSONExtractRaw(properties, 'age')) < {p0_min:Float64} OR toFloat64OrZero(JSONExtractRaw(properties, 'age')) > {p0_max:Float64})",
    );
  });

  it('gt: does NOT replace non-JSON expressions (top-level column)', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('country');
    const clause = sql(buildOperatorClause(expr, 'gt', 'p0', params, '0'));
    expect(clause).toBe('toFloat64OrZero(argMax(country, timestamp)) > {p0:Float64}');
  });

  it('is_set: uses JSONHas for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('user_properties.active');
    const clause = sql(buildOperatorClause(expr, 'is_set', 'p0', params));
    expect(clause).toBe("JSONHas(argMax(user_properties, timestamp), 'active')");
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_not_set: uses NOT JSONHas for JSON properties', () => {
    const params: Record<string, unknown> = {};
    const expr = resolvePropertyExpr('user_properties.active');
    const clause = sql(buildOperatorClause(expr, 'is_not_set', 'p0', params));
    expect(clause).toBe("NOT JSONHas(argMax(user_properties, timestamp), 'active')");
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_set: uses JSONHas for event properties JSON expression', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.score');
    const clause = sql(buildOperatorClause(expr, 'is_set', 'p0', params));
    expect(clause).toBe("JSONHas(properties, 'score')");
  });

  it('is_not_set: uses NOT JSONHas for event properties JSON expression', () => {
    const params: Record<string, unknown> = {};
    const expr = resolveEventPropertyExpr('properties.score');
    const clause = sql(buildOperatorClause(expr, 'is_not_set', 'p0', params));
    expect(clause).toBe("NOT JSONHas(properties, 'score')");
  });

  it('is_set: falls back to != empty for top-level column', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(resolvePropertyExpr('country'), 'is_set', 'p0', params));
    expect(clause).toBe("argMax(country, timestamp) != ''");
  });

  it('is_not_set: falls back to = empty for top-level column', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(resolvePropertyExpr('country'), 'is_not_set', 'p0', params));
    expect(clause).toBe("argMax(country, timestamp) = ''");
  });
});

describe('buildOperatorClause — legacy raw() path (backward compatibility)', () => {
  it('eq: uses OR with JSONExtractRaw when expr contains JSONExtractString', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'is_premium')");
    const clause = sql(buildOperatorClause(expr, 'eq', 'p0', params, 'true'));
    expect(clause).toBe(
      "(JSONExtractString(argMax(user_properties, timestamp), 'is_premium') = {p0:String} OR toString(JSONExtractRaw(argMax(user_properties, timestamp), 'is_premium')) = {p0:String})",
    );
    expect(params['p0']).toBe('true');
  });

  it('eq: does NOT add OR fallback for non-JSON expressions (top-level column)', () => {
    const params: Record<string, unknown> = {};
    const expr = raw('argMax(country, timestamp)');
    const clause = sql(buildOperatorClause(expr, 'eq', 'p0', params, 'US'));
    expect(clause).toBe('argMax(country, timestamp) = {p0:String}');
    expect(params['p0']).toBe('US');
  });

  it('neq: uses JSONHas guard AND with JSONExtractRaw when expr contains JSONExtractString', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(properties, timestamp), 'active')");
    const clause = sql(buildOperatorClause(expr, 'neq', 'p0', params, 'false'));
    expect(clause).toBe(
      "(JSONHas(argMax(properties, timestamp), 'active') AND JSONExtractString(argMax(properties, timestamp), 'active') != {p0:String} AND toString(JSONExtractRaw(argMax(properties, timestamp), 'active')) != {p0:String})",
    );
    expect(params['p0']).toBe('false');
  });

  it('neq: does NOT add AND guard for non-JSON expressions', () => {
    const params: Record<string, unknown> = {};
    const expr = raw('argMax(country, timestamp)');
    const clause = sql(buildOperatorClause(expr, 'neq', 'p0', params, 'US'));
    expect(clause).toBe('argMax(country, timestamp) != {p0:String}');
    expect(params['p0']).toBe('US');
  });

  it('eq: event-level JSON expression also uses OR with JSONExtractRaw', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'active')");
    const clause = sql(buildOperatorClause(expr, 'eq', 'ef0', params, 'true'));
    expect(clause).toBe(
      "(JSONExtractString(properties, 'active') = {ef0:String} OR toString(JSONExtractRaw(properties, 'active')) = {ef0:String})",
    );
  });
});

describe('buildOperatorClause — numeric operators use JSONExtractRaw (not JSONExtractString)', () => {
  it('gt: replaces JSONExtractString with JSONExtractRaw in raw expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'price')");
    const clause = sql(buildOperatorClause(expr, 'gt', 'p0', params, '10'));
    expect(clause).toBe(
      "toFloat64OrZero(JSONExtractRaw(argMax(user_properties, timestamp), 'price')) > {p0:Float64}",
    );
    expect(params['p0']).toBe(10);
  });

  it('lt: replaces JSONExtractString with JSONExtractRaw in raw expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'count')");
    const clause = sql(buildOperatorClause(expr, 'lt', 'p0', params, '5'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'count')) < {p0:Float64}");
    expect(params['p0']).toBe(5);
  });

  it('gte: replaces JSONExtractString with JSONExtractRaw in raw expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'score')");
    const clause = sql(buildOperatorClause(expr, 'gte', 'p0', params, '5'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'score')) >= {p0:Float64}");
  });

  it('lte: replaces JSONExtractString with JSONExtractRaw in raw expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'amount')");
    const clause = sql(buildOperatorClause(expr, 'lte', 'p0', params, '100'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'amount')) <= {p0:Float64}");
  });

  it('between: replaces JSONExtractString with JSONExtractRaw in raw expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'price')");
    const clause = sql(buildOperatorClause(expr, 'between', 'p0', params, undefined, ['10', '50']));
    expect(clause).toBe(
      "toFloat64OrZero(JSONExtractRaw(properties, 'price')) >= {p0_min:Float64} AND toFloat64OrZero(JSONExtractRaw(properties, 'price')) <= {p0_max:Float64}",
    );
    expect(params['p0_min']).toBe(10);
    expect(params['p0_max']).toBe(50);
  });

  it('not_between: replaces JSONExtractString with JSONExtractRaw in raw expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'age')");
    const clause = sql(buildOperatorClause(expr, 'not_between', 'p0', params, undefined, ['18', '65']));
    expect(clause).toBe(
      "(toFloat64OrZero(JSONExtractRaw(properties, 'age')) < {p0_min:Float64} OR toFloat64OrZero(JSONExtractRaw(properties, 'age')) > {p0_max:Float64})",
    );
  });

  it('gt: does NOT replace non-JSON expressions (top-level column)', () => {
    const params: Record<string, unknown> = {};
    const expr = raw('argMax(some_numeric_col, timestamp)');
    const clause = sql(buildOperatorClause(expr, 'gt', 'p0', params, '0'));
    expect(clause).toBe('toFloat64OrZero(argMax(some_numeric_col, timestamp)) > {p0:Float64}');
  });
});

describe('buildOperatorClause — LIKE wildcard escaping', () => {
  it('contains: escapes % in value so it is treated as a literal', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('prop'), 'contains', 'p0', params, 'a%b'));
    expect(clause).toBe('prop LIKE {p0:String}');
    expect(params['p0']).toBe('%a\\%b%');
  });

  it('contains: escapes _ in value so it is treated as a literal', () => {
    const params: Record<string, unknown> = {};
    sql(buildOperatorClause(raw('prop'), 'contains', 'p0', params, 'a_b'));
    expect(params['p0']).toBe('%a\\_b%');
  });

  it('contains: escapes backslash in value', () => {
    const params: Record<string, unknown> = {};
    sql(buildOperatorClause(raw('prop'), 'contains', 'p0', params, 'a\\b'));
    expect(params['p0']).toBe('%a\\\\b%');
  });

  it('contains: plain value without wildcards passes through unchanged (modulo wrapping %)', () => {
    const params: Record<string, unknown> = {};
    sql(buildOperatorClause(raw('prop'), 'contains', 'p0', params, 'hello'));
    expect(params['p0']).toBe('%hello%');
  });

  it('not_contains: escapes % in value', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('prop'), 'not_contains', 'p0', params, 'x%y'));
    expect(clause).toBe('prop NOT LIKE {p0:String}');
    expect(params['p0']).toBe('%x\\%y%');
  });

  it('not_contains: escapes _ in value', () => {
    const params: Record<string, unknown> = {};
    sql(buildOperatorClause(raw('prop'), 'not_contains', 'p0', params, 'x_y'));
    expect(params['p0']).toBe('%x\\_y%');
  });

  it('contains: empty value produces %% pattern (matches all)', () => {
    const params: Record<string, unknown> = {};
    sql(buildOperatorClause(raw('prop'), 'contains', 'p0', params, ''));
    expect(params['p0']).toBe('%%');
  });
});

describe('buildOperatorClause — date operators guard against empty value and epoch false positives', () => {
  it('is_date_before: returns always-false clause when value is empty string', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('expr'), 'is_date_before', 'p0', params));
    expect(clause).toBe('1 = 0');
  });

  it('is_date_before: returns always-false clause when value is undefined', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('expr'), 'is_date_before', 'p0', params, undefined));
    expect(clause).toBe('1 = 0');
  });

  it('is_date_after: returns always-false clause when value is empty string', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('expr'), 'is_date_after', 'p0', params, ''));
    expect(clause).toBe('1 = 0');
  });

  it('is_date_exact: returns always-false clause when value is empty string', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('expr'), 'is_date_exact', 'p0', params, ''));
    expect(clause).toBe('1 = 0');
  });

  it('is_date_before: generates SQL with epoch exclusion guard when value is valid', () => {
    const params: Record<string, unknown> = {};
    const exprStr = "JSONExtractString(argMax(user_properties, timestamp), 'signup_date')";
    const clause = sql(buildOperatorClause(raw(exprStr), 'is_date_before', 'p0', params, '2025-03-01'));
    expect(params['p0']).toBe('2025-03-01');
    expect(clause).toContain('parseDateTimeBestEffortOrZero');
    expect(clause).toContain('toDateTime(0)');
    expect(clause).toContain('parseDateTimeBestEffort({p0:String})');
    expect(clause).toBe(
      `(parseDateTimeBestEffortOrZero(${exprStr}) != toDateTime(0) AND parseDateTimeBestEffortOrZero(${exprStr}) < parseDateTimeBestEffort({p0:String}))`,
    );
  });

  it('is_date_after: generates SQL with epoch exclusion guard when value is valid', () => {
    const params: Record<string, unknown> = {};
    const exprStr = "JSONExtractString(argMax(user_properties, timestamp), 'signup_date')";
    const clause = sql(buildOperatorClause(raw(exprStr), 'is_date_after', 'p0', params, '2025-03-01'));
    expect(params['p0']).toBe('2025-03-01');
    expect(clause).toBe(
      `(parseDateTimeBestEffortOrZero(${exprStr}) != toDateTime(0) AND parseDateTimeBestEffortOrZero(${exprStr}) > parseDateTimeBestEffort({p0:String}))`,
    );
  });

  it('is_date_exact: generates SQL with epoch exclusion guard when value is valid', () => {
    const params: Record<string, unknown> = {};
    const exprStr = "JSONExtractString(argMax(user_properties, timestamp), 'signup_date')";
    const clause = sql(buildOperatorClause(raw(exprStr), 'is_date_exact', 'p0', params, '2025-03-15'));
    expect(params['p0']).toBe('2025-03-15');
    expect(clause).toBe(
      `(parseDateTimeBestEffortOrZero(${exprStr}) != toDateTime(0) AND toDate(parseDateTimeBestEffortOrZero(${exprStr})) = toDate(parseDateTimeBestEffort({p0:String})))`,
    );
  });
});

describe('buildOperatorClause — is_set / is_not_set with JSON expressions use JSONHas', () => {
  it('is_set: uses JSONHas for user_properties JSON expression (raw path)', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'active')");
    const clause = sql(buildOperatorClause(expr, 'is_set', 'p0', params));
    expect(clause).toBe("JSONHas(argMax(user_properties, timestamp), 'active')");
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_not_set: uses NOT JSONHas for user_properties JSON expression (raw path)', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'active')");
    const clause = sql(buildOperatorClause(expr, 'is_not_set', 'p0', params));
    expect(clause).toBe("NOT JSONHas(argMax(user_properties, timestamp), 'active')");
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_set: uses JSONHas for event properties JSON expression (raw path)', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'score')");
    const clause = sql(buildOperatorClause(expr, 'is_set', 'p0', params));
    expect(clause).toBe("JSONHas(properties, 'score')");
  });

  it('is_not_set: uses NOT JSONHas for event properties JSON expression (raw path)', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'score')");
    const clause = sql(buildOperatorClause(expr, 'is_not_set', 'p0', params));
    expect(clause).toBe("NOT JSONHas(properties, 'score')");
  });

  it('is_set: falls back to != \'\' for non-JSON (top-level column) expression', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'is_set', 'p0', params));
    expect(clause).toBe("argMax(country, timestamp) != ''");
  });

  it('is_not_set: falls back to = \'\' for non-JSON (top-level column) expression', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'is_not_set', 'p0', params));
    expect(clause).toBe("argMax(country, timestamp) = ''");
  });
});

describe('buildOperatorClause — in / not_in operators', () => {
  it('in: produces IN {pk:Array(String)} clause and stores values array in params', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'in', 'p0', params, undefined, ['US', 'CA', 'GB']));
    expect(clause).toBe('argMax(country, timestamp) IN {p0:Array(String)}');
    expect(params['p0']).toEqual(['US', 'CA', 'GB']);
  });

  it('not_in: produces NOT IN {pk:Array(String)} clause', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'not_in', 'p0', params, undefined, ['RU', 'CN']));
    expect(clause).toBe('argMax(country, timestamp) NOT IN {p0:Array(String)}');
    expect(params['p0']).toEqual(['RU', 'CN']);
  });
});

describe('buildOperatorClause — regex / not_regex operators', () => {
  it('regex: produces match(expr, pattern) with value stored in params', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'regex', 'p0', params, '^US.*'));
    expect(clause).toBe('match(argMax(country, timestamp), {p0:String})');
    expect(params['p0']).toBe('^US.*');
  });

  it('not_regex: produces NOT match(expr, pattern)', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'not_regex', 'p0', params, '^(test|demo)'));
    expect(clause).toBe('NOT match(argMax(country, timestamp), {p0:String})');
    expect(params['p0']).toBe('^(test|demo)');
  });
});

describe('buildOperatorClause — contains_multi / not_contains_multi operators', () => {
  it('contains_multi: produces multiSearchAny(expr, values) with array stored in params', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'contains_multi', 'p0', params, undefined, ['North', 'South']));
    expect(clause).toBe('multiSearchAny(argMax(country, timestamp), {p0:Array(String)})');
    expect(params['p0']).toEqual(['North', 'South']);
  });

  it('not_contains_multi: produces NOT multiSearchAny(expr, values)', () => {
    const params: Record<string, unknown> = {};
    const clause = sql(buildOperatorClause(raw('argMax(country, timestamp)'), 'not_contains_multi', 'p0', params, undefined, ['spam', 'bot']));
    expect(clause).toBe('NOT multiSearchAny(argMax(country, timestamp), {p0:Array(String)})');
    expect(params['p0']).toEqual(['spam', 'bot']);
  });
});
