import { describe, it, expect } from 'vitest';
import { buildEventConditionSubquery } from '../conditions/event';
import type { BuildContext } from '../types';

function makeCtx(overrides?: Partial<BuildContext>): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
    ...overrides,
  };
}

describe('buildEventConditionSubquery — upper bound constraint', () => {
  it('includes timestamp <= upperBound to exclude post-period events (with dateTo)', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 1, time_window_days: 30 },
      ctx,
    );
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
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'signup', count_operator: 'gte', count: 1, time_window_days: 7 },
      ctx,
    );
    expect(sql).toContain('timestamp <= now64(3)');
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL');
  });

  it('upper bound appears before filterClause (event_filters not duplicated)', () => {
    const ctx = makeCtx({ dateTo: '2025-06-30 23:59:59' });
    const sql = buildEventConditionSubquery(
      {
        type: 'event',
        event_name: 'purchase',
        count_operator: 'gte',
        count: 1,
        time_window_days: 30,
        event_filters: [{ property: 'properties.category', operator: 'eq', value: 'electronics' }],
      },
      ctx,
    );
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    // Ensure the filter clause is still appended after the upper bound
    expect(sql).toContain("JSONExtractString(properties, 'category')");
  });
});

describe('buildEventConditionSubquery — eq + count=0 (zero-count special case)', () => {
  it('uses countIf absence pattern instead of HAVING count() = 0 when count_operator=eq and count=0', () => {
    const ctx = makeCtx();
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'eq', count: 0, time_window_days: 30 },
      ctx,
    );
    // Must NOT filter by event_name in the WHERE clause (that would exclude users with 0 events)
    expect(sql).not.toContain('AND event_name = {coh_0_event:String}');
    // Must use countIf to count matching events in the HAVING clause
    expect(sql).toContain('HAVING countIf(event_name = {coh_0_event:String}) = 0');
    // Must still have time window bounds
    expect(sql).toContain('timestamp >=');
    expect(sql).toContain('timestamp <=');
  });

  it('rolling-window mode (no dateFrom): uses now64(3) as upper bound', () => {
    const ctx = makeCtx();
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'signup', count_operator: 'eq', count: 0, time_window_days: 90 },
      ctx,
    );
    expect(sql).toContain('timestamp <= now64(3)');
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_days:UInt32} DAY');
    expect(ctx.queryParams['coh_0_event']).toBe('signup');
    expect(ctx.queryParams['coh_0_days']).toBe(90);
  });

  it('rolling-window mode (with dateTo): uses dateTo param as upper bound', () => {
    const ctx = makeCtx({ dateTo: '2025-03-31 23:59:59' });
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'eq', count: 0, time_window_days: 30 },
      ctx,
    );
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_days:UInt32} DAY');
    expect(ctx.queryParams['coh_date_to']).toBe('2025-03-31 23:59:59');
  });

  it('fixed-window mode (dateFrom + dateTo): uses exact [dateFrom, dateTo] range', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'checkout', count_operator: 'eq', count: 0, time_window_days: 30 },
      ctx,
    );
    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(ctx.queryParams['coh_date_from']).toBe('2025-01-01 00:00:00');
    expect(ctx.queryParams['coh_date_to']).toBe('2025-01-31 23:59:59');
  });

  it('with event_filters: includes filter conditions inside countIf', () => {
    const ctx = makeCtx();
    const sql = buildEventConditionSubquery(
      {
        type: 'event',
        event_name: 'purchase',
        count_operator: 'eq',
        count: 0,
        time_window_days: 30,
        event_filters: [{ property: 'properties.category', operator: 'eq', value: 'electronics' }],
      },
      ctx,
    );
    // countIf must include both the event_name check and the filter
    expect(sql).toContain('HAVING countIf(event_name = {coh_0_event:String}');
    expect(sql).toContain("JSONExtractString(properties, 'category')");
    // event_name should NOT appear in WHERE (only in countIf)
    expect(sql).not.toContain('AND event_name = {coh_0_event:String}\n');
  });

  it('eq + count > 0 still uses standard HAVING count() = N path', () => {
    const ctx = makeCtx();
    const sql = buildEventConditionSubquery(
      { type: 'event', event_name: 'purchase', count_operator: 'eq', count: 3, time_window_days: 30 },
      ctx,
    );
    // Should filter event_name in WHERE (standard path)
    expect(sql).toContain('AND event_name = {coh_0_event:String}');
    // Should use standard HAVING with count()
    expect(sql).toContain('HAVING count() = {coh_0_count:UInt64}');
    expect(ctx.queryParams['coh_0_count']).toBe(3);
  });

  it('eq + count=0 with aggregation_type (non-count) still uses standard HAVING path', () => {
    // Aggregation-based zero (e.g. "sum of purchase_value = 0") is theoretically valid
    // via HAVING since aggregation values can be 0 for users who did make a purchase but
    // with a zero-value field. The special case only applies to count aggregation.
    const ctx = makeCtx();
    const sql = buildEventConditionSubquery(
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
    );
    // Should use standard HAVING path (not the zero-count special case)
    expect(sql).toContain('AND event_name = {coh_0_event:String}');
    expect(sql).toContain('HAVING sum(');
    expect(sql).toContain('= {coh_0_count:Float64}');
  });
});
