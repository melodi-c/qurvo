import { describe, it, expect } from 'vitest';
import {
  resolvePropertyExpr,
  resolveEventPropertyExpr,
  buildOperatorClause,
} from '../../cohort/helpers';
import { compileExprToSql } from '../../compiler';
import { raw } from '../../builders';

/** Helper to compile an Expr to its SQL string. */
function sql(expr: ReturnType<typeof resolvePropertyExpr>): string {
  return compileExprToSql(expr).sql;
}

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

  it('escapes single quote in property key', () => {
    expect(sql(resolvePropertyExpr("properties.user's_key"))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'user\\'s_key')",
    );
  });

  it('escapes backslash in property key', () => {
    expect(sql(resolvePropertyExpr('properties.foo\\'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\\\')",
    );
  });

  it('escapes backslash followed by single quote (SQL injection vector)', () => {
    expect(sql(resolvePropertyExpr("properties.foo\\'"))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\\\\\'')");
  });

  it('escapes newline in property key', () => {
    expect(sql(resolvePropertyExpr('properties.foo\nbar'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\nbar')",
    );
  });

  it('escapes carriage return in property key', () => {
    expect(sql(resolvePropertyExpr('properties.foo\rbar'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\rbar')",
    );
  });

  it('escapes tab in property key', () => {
    expect(sql(resolvePropertyExpr('properties.foo\tbar'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\tbar')",
    );
  });

  it('escapes null byte in property key', () => {
    expect(sql(resolvePropertyExpr('properties.foo\0bar'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\0bar')",
    );
  });

  it('property key ending with backslash is correctly escaped (path\\ case)', () => {
    expect(sql(resolvePropertyExpr('properties.path\\'))).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'path\\\\')",
    );
  });
});

describe('resolveEventPropertyExpr (cohort-query helpers)', () => {
  it('resolves top-level column directly', () => {
    expect(sql(resolveEventPropertyExpr('country'))).toBe('country');
  });

  it('resolves properties.* to JSONExtractString', () => {
    expect(sql(resolveEventPropertyExpr('properties.plan'))).toBe("JSONExtractString(properties, 'plan')");
  });

  it('escapes backslash in property key', () => {
    expect(sql(resolveEventPropertyExpr('properties.foo\\'))).toBe(
      "JSONExtractString(properties, 'foo\\\\')",
    );
  });

  it('escapes backslash+quote (SQL injection vector)', () => {
    expect(sql(resolveEventPropertyExpr("user_properties.foo\\'"))).toBe(
      "JSONExtractString(user_properties, 'foo\\\\\\'')");
  });

  it('escapes newline in event property key', () => {
    expect(sql(resolveEventPropertyExpr('properties.foo\nbar'))).toBe(
      "JSONExtractString(properties, 'foo\\nbar')",
    );
  });

  it('escapes tab in event property key', () => {
    expect(sql(resolveEventPropertyExpr('properties.key\twith\ttabs'))).toBe(
      "JSONExtractString(properties, 'key\\twith\\ttabs')",
    );
  });
});

describe('buildOperatorClause — eq/neq with JSON expressions use OR/AND with JSONExtractRaw for boolean/number support', () => {
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

  it('neq: uses AND with JSONExtractRaw when expr contains JSONExtractString', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(properties, timestamp), 'active')");
    const clause = sql(buildOperatorClause(expr, 'neq', 'p0', params, 'false'));
    expect(clause).toBe(
      "(JSONExtractString(argMax(properties, timestamp), 'active') != {p0:String} AND toString(JSONExtractRaw(argMax(properties, timestamp), 'active')) != {p0:String})",
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
  it('gt: replaces JSONExtractString with JSONExtractRaw in expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'price')");
    const clause = sql(buildOperatorClause(expr, 'gt', 'p0', params, '10'));
    expect(clause).toBe(
      "toFloat64OrZero(JSONExtractRaw(argMax(user_properties, timestamp), 'price')) > {p0:Float64}",
    );
    expect(params['p0']).toBe(10);
  });

  it('lt: replaces JSONExtractString with JSONExtractRaw in expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'count')");
    const clause = sql(buildOperatorClause(expr, 'lt', 'p0', params, '5'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'count')) < {p0:Float64}");
    expect(params['p0']).toBe(5);
  });

  it('gte: replaces JSONExtractString with JSONExtractRaw in expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'score')");
    const clause = sql(buildOperatorClause(expr, 'gte', 'p0', params, '5'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'score')) >= {p0:Float64}");
  });

  it('lte: replaces JSONExtractString with JSONExtractRaw in expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'amount')");
    const clause = sql(buildOperatorClause(expr, 'lte', 'p0', params, '100'));
    expect(clause).toBe("toFloat64OrZero(JSONExtractRaw(properties, 'amount')) <= {p0:Float64}");
  });

  it('between: replaces JSONExtractString with JSONExtractRaw in expr', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'price')");
    const clause = sql(buildOperatorClause(expr, 'between', 'p0', params, undefined, ['10', '50']));
    expect(clause).toBe(
      "toFloat64OrZero(JSONExtractRaw(properties, 'price')) >= {p0_min:Float64} AND toFloat64OrZero(JSONExtractRaw(properties, 'price')) <= {p0_max:Float64}",
    );
    expect(params['p0_min']).toBe(10);
    expect(params['p0_max']).toBe(50);
  });

  it('not_between: replaces JSONExtractString with JSONExtractRaw in expr', () => {
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

describe('buildOperatorClause — is_set / is_not_set with JSON expressions use JSONExtractRaw', () => {
  it('is_set: uses JSONExtractRaw NOT IN for user_properties JSON expression', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'active')");
    const clause = sql(buildOperatorClause(expr, 'is_set', 'p0', params));
    expect(clause).toBe("JSONExtractRaw(argMax(user_properties, timestamp), 'active') NOT IN ('', 'null', '\"\"')");
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_not_set: uses JSONExtractRaw IN for user_properties JSON expression', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(argMax(user_properties, timestamp), 'active')");
    const clause = sql(buildOperatorClause(expr, 'is_not_set', 'p0', params));
    expect(clause).toBe("JSONExtractRaw(argMax(user_properties, timestamp), 'active') IN ('', 'null', '\"\"')");
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('is_set: uses JSONExtractRaw NOT IN for event properties JSON expression', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'score')");
    const clause = sql(buildOperatorClause(expr, 'is_set', 'p0', params));
    expect(clause).toBe("JSONExtractRaw(properties, 'score') NOT IN ('', 'null', '\"\"')");
  });

  it('is_not_set: uses JSONExtractRaw IN for event properties JSON expression', () => {
    const params: Record<string, unknown> = {};
    const expr = raw("JSONExtractString(properties, 'score')");
    const clause = sql(buildOperatorClause(expr, 'is_not_set', 'p0', params));
    expect(clause).toBe("JSONExtractRaw(properties, 'score') IN ('', 'null', '\"\"')");
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
