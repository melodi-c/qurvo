import { describe, it, expect } from 'vitest';
import { resolvePropertyExpr, resolveEventPropertyExpr } from '../helpers';

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
