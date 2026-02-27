import { describe, it, expect } from 'vitest';
import { resolvePropertyExpr, resolveEventPropertyExpr, buildOperatorClause } from '../helpers';

describe('resolvePropertyExpr (cohort-query helpers)', () => {
  it('resolves top-level column with argMax', () => {
    expect(resolvePropertyExpr('country')).toBe('argMax(country, timestamp)');
  });

  it('resolves properties.* to JSONExtractString with argMax', () => {
    expect(resolvePropertyExpr('properties.plan')).toBe("JSONExtractString(argMax(properties, timestamp), 'plan')");
  });

  it('resolves user_properties.* to JSONExtractString with argMax', () => {
    expect(resolvePropertyExpr('user_properties.email')).toBe("JSONExtractString(argMax(user_properties, timestamp), 'email')");
  });

  it('escapes single quote in property key', () => {
    expect(resolvePropertyExpr("properties.user's_key")).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'user\\'s_key')",
    );
  });

  it('escapes backslash in property key', () => {
    expect(resolvePropertyExpr('properties.foo\\')).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\\\')",
    );
  });

  it('escapes backslash followed by single quote (SQL injection vector)', () => {
    // Input: "properties.foo\\'" — the key contains a backslash then a quote.
    // Expected: backslash → "\\\\", quote → "\\'", so key becomes "foo\\\\\\'"
    expect(resolvePropertyExpr("properties.foo\\'")).toBe(
      "JSONExtractString(argMax(properties, timestamp), 'foo\\\\\\'')");
  });
});

describe('resolveEventPropertyExpr (cohort-query helpers)', () => {
  it('resolves top-level column directly', () => {
    expect(resolveEventPropertyExpr('country')).toBe('country');
  });

  it('resolves properties.* to JSONExtractString', () => {
    expect(resolveEventPropertyExpr('properties.plan')).toBe("JSONExtractString(properties, 'plan')");
  });

  it('escapes backslash in property key', () => {
    expect(resolveEventPropertyExpr('properties.foo\\')).toBe(
      "JSONExtractString(properties, 'foo\\\\')",
    );
  });

  it('escapes backslash+quote (SQL injection vector)', () => {
    expect(resolveEventPropertyExpr("user_properties.foo\\'")).toBe(
      "JSONExtractString(user_properties, 'foo\\\\\\'')");
  });
});

describe('buildOperatorClause — LIKE wildcard escaping', () => {
  it('contains: escapes % in value so it is treated as a literal', () => {
    const params: Record<string, unknown> = {};
    const clause = buildOperatorClause('prop', 'contains', 'p0', params, 'a%b');
    expect(clause).toBe('prop LIKE {p0:String}');
    // % in value must be escaped to \% so ClickHouse treats it as a literal
    expect(params['p0']).toBe('%a\\%b%');
  });

  it('contains: escapes _ in value so it is treated as a literal', () => {
    const params: Record<string, unknown> = {};
    buildOperatorClause('prop', 'contains', 'p0', params, 'a_b');
    expect(params['p0']).toBe('%a\\_b%');
  });

  it('contains: escapes backslash in value', () => {
    const params: Record<string, unknown> = {};
    buildOperatorClause('prop', 'contains', 'p0', params, 'a\\b');
    expect(params['p0']).toBe('%a\\\\b%');
  });

  it('contains: plain value without wildcards passes through unchanged (modulo wrapping %)', () => {
    const params: Record<string, unknown> = {};
    buildOperatorClause('prop', 'contains', 'p0', params, 'hello');
    expect(params['p0']).toBe('%hello%');
  });

  it('not_contains: escapes % in value', () => {
    const params: Record<string, unknown> = {};
    const clause = buildOperatorClause('prop', 'not_contains', 'p0', params, 'x%y');
    expect(clause).toBe('prop NOT LIKE {p0:String}');
    expect(params['p0']).toBe('%x\\%y%');
  });

  it('not_contains: escapes _ in value', () => {
    const params: Record<string, unknown> = {};
    buildOperatorClause('prop', 'not_contains', 'p0', params, 'x_y');
    expect(params['p0']).toBe('%x\\_y%');
  });

  it('contains: empty value produces %% pattern (matches all — correct degenerate case)', () => {
    const params: Record<string, unknown> = {};
    buildOperatorClause('prop', 'contains', 'p0', params, '');
    expect(params['p0']).toBe('%%');
  });
});
