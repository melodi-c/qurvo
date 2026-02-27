import { describe, it, expect } from 'vitest';
import { buildEventConditionSubquery } from '../conditions/event';
import type { BuildContext } from '../types';

function makeCtx(dateTo?: string): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
    dateTo,
  };
}

describe('buildEventConditionSubquery — upper bound constraint', () => {
  it('includes timestamp <= upperBound to exclude post-period events (with dateTo)', () => {
    const ctx = makeCtx('2025-01-31 23:59:59');
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
    const ctx = makeCtx('2025-06-30 23:59:59');
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
