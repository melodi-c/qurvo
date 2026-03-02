import { describe, it, expect } from 'vitest';
import { buildEventConditionSubquery } from '../conditions/event';
import { compile } from '@qurvo/ch-query';
import type { BuildContext } from '../types';

function makeCtx(overrides?: Partial<BuildContext>): BuildContext {
  return {
    projectIdParam: 'pid',
    projectId: 'test-project-id',
    counter: { value: 0 },
    ...overrides,
  };
}

/** Compile SelectNode to SQL string */
function toSql(ctx: BuildContext, ...args: Parameters<typeof buildEventConditionSubquery>): string {
  return compile(buildEventConditionSubquery(...args)).sql;
}

/** Extract compiled params from a node */
function params(node: ReturnType<typeof buildEventConditionSubquery>) {
  return compile(node).params;
}

describe('buildEventConditionSubquery — event_filters: [] (empty array)', () => {
  it('produces valid SQL without any filter clause when event_filters is empty', () => {
    const ctx = makeCtx({ dateTo: '2025-03-01 23:59:59' });
    const sql = toSql(ctx,
      {
        type: 'event',
        event_name: 'pageview',
        count_operator: 'gte',
        count: 1,
        time_window_days: 7,
        event_filters: [],
      },
      ctx,
    );
    // Must still contain timestamp bounds and event name
    expect(sql).toContain('timestamp >=');
    expect(sql).toContain('timestamp <=');
    expect(sql).toContain('{coh_0_event:String}');
    // Must NOT contain any AND clause after the upper bound that looks like a filter
    // (no spurious "AND" from empty filters)
    const upperBoundIdx = sql.indexOf('timestamp <=');
    const havingIdx = sql.indexOf('HAVING');
    // The SQL between upper bound and HAVING should be free of extra AND fragments
    const between = sql.slice(upperBoundIdx, havingIdx);
    expect(between).not.toContain('JSONExtract');
  });

  it('produces identical SQL to no event_filters property when event_filters is []', () => {
    const ctxA = makeCtx({ dateTo: '2025-03-01 23:59:59' });
    const ctxB = makeCtx({ dateTo: '2025-03-01 23:59:59' });
    const base = {
      type: 'event' as const,
      event_name: 'signup',
      count_operator: 'gte' as const,
      count: 2,
      time_window_days: 14,
    };
    const sqlWithEmpty = compile(buildEventConditionSubquery({ ...base, event_filters: [] }, ctxA)).sql;
    const sqlWithout = compile(buildEventConditionSubquery({ ...base }, ctxB)).sql;
    expect(sqlWithEmpty).toBe(sqlWithout);
  });
});

describe('buildEventConditionSubquery — upper bound constraint', () => {
  it('includes timestamp <= upperBound to exclude post-period events (with dateTo)', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = compile(buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 1, time_window_days: 30 },
      ctx,
    )).sql;
    // Must contain both lower and upper bounds on timestamp
    expect(sql).toContain('timestamp >=');
    expect(sql).toContain('timestamp <=');
    // Upper bound must reference the parameterised dateTo expression
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    // Lower bound must also use dateTo (rolling window)
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL');
  });

  it('includes timestamp <= now64(3) when dateTo is absent', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventConditionSubquery(
      { type: 'event', event_name: 'signup', count_operator: 'gte', count: 1, time_window_days: 7 },
      ctx,
    )).sql;
    expect(sql).toContain('timestamp <= now64(3)');
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL');
  });

  it('upper bound appears before filterClause (event_filters not duplicated)', () => {
    const ctx = makeCtx({ dateTo: '2025-06-30 23:59:59' });
    const sql = compile(buildEventConditionSubquery(
      {
        type: 'event',
        event_name: 'purchase',
        count_operator: 'gte',
        count: 1,
        time_window_days: 30,
        event_filters: [{ property: 'properties.category', operator: 'eq', value: 'electronics' }],
      },
      ctx,
    )).sql;
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    // Ensure the filter clause is still appended after the upper bound
    expect(sql).toContain("JSONExtractString(properties, 'category')");
  });
});

describe('buildEventConditionSubquery — eq + count=0 (zero-count special case)', () => {
  it('uses countIf absence pattern instead of HAVING count() = 0 when count_operator=eq and count=0', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'eq', count: 0, time_window_days: 30 },
      ctx,
    )).sql;
    // Must NOT filter by event_name in the WHERE clause (that would exclude users with 0 events)
    expect(sql).not.toContain('event_name = {coh_0_event:String}' + '\n');
    // Must use countIf to count matching events in the HAVING clause
    expect(sql).toContain('HAVING countIf(event_name = {coh_0_event:String}) = 0');
    // Must still have time window bounds
    expect(sql).toContain('timestamp >=');
    expect(sql).toContain('timestamp <=');
  });

  it('rolling-window mode (no dateFrom): uses now64(3) as upper bound', () => {
    const ctx = makeCtx();
    const node = buildEventConditionSubquery(
      { type: 'event', event_name: 'signup', count_operator: 'eq', count: 0, time_window_days: 90 },
      ctx,
    );
    const { sql, params: p } = compile(node);
    expect(sql).toContain('timestamp <= now64(3)');
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_days:UInt32} DAY');
    expect(p['coh_0_event']).toBe('signup');
    expect(p['coh_0_days']).toBe(90);
  });

  it('rolling-window mode (with dateTo): uses dateTo param as upper bound', () => {
    const ctx = makeCtx({ dateTo: '2025-03-31 23:59:59' });
    const node = buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'eq', count: 0, time_window_days: 30 },
      ctx,
    );
    const { sql, params: p } = compile(node);
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_days:UInt32} DAY');
    expect(p['coh_date_to']).toBe('2025-03-31 23:59:59');
  });

  it('fixed-window mode (dateFrom + dateTo): uses exact [dateFrom, dateTo] range', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const node = buildEventConditionSubquery(
      { type: 'event', event_name: 'checkout', count_operator: 'eq', count: 0, time_window_days: 30 },
      ctx,
    );
    const { sql, params: p } = compile(node);
    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(p['coh_date_from']).toBe('2025-01-01 00:00:00');
    expect(p['coh_date_to']).toBe('2025-01-31 23:59:59');
  });

  it('with event_filters: includes filter conditions inside countIf', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventConditionSubquery(
      {
        type: 'event',
        event_name: 'purchase',
        count_operator: 'eq',
        count: 0,
        time_window_days: 30,
        event_filters: [{ property: 'properties.category', operator: 'eq', value: 'electronics' }],
      },
      ctx,
    )).sql;
    // countIf must include both the event_name check and the filter
    expect(sql).toContain('HAVING countIf(event_name = {coh_0_event:String}');
    expect(sql).toContain("JSONExtractString(properties, 'category')");
    // event_name should NOT appear in WHERE (only in countIf)
    const whereSection = sql.slice(sql.indexOf('WHERE'), sql.indexOf('GROUP BY'));
    expect(whereSection).not.toContain('event_name = {coh_0_event:String}');
  });

  it('eq + count > 0 still uses standard HAVING count() = N path', () => {
    const ctx = makeCtx();
    const node = buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'eq', count: 3, time_window_days: 30 },
      ctx,
    );
    const { sql, params: p } = compile(node);
    // Should filter event_name in WHERE (standard path)
    expect(sql).toContain('event_name = {coh_0_event:String}');
    // Should use standard HAVING with count()
    expect(sql).toContain('HAVING count() = {coh_0_count:UInt64}');
    expect(p['coh_0_count']).toBe(3);
  });

  it('eq + count=0 with aggregation_type (non-count) still uses standard HAVING path', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventConditionSubquery(
      {
        type: 'event',
        event_name: 'purchase',
        count_operator: 'eq',
        count: 0,
        time_window_days: 30,
        aggregation_type: 'sum',
        aggregation_property: 'properties.value',
      },
      ctx,
    )).sql;
    // Should use standard HAVING path (not the zero-count special case)
    expect(sql).toContain('event_name = {coh_0_event:String}');
    expect(sql).toContain('HAVING sum(');
    expect(sql).toContain('= {coh_0_count:Float64}');
  });
});
