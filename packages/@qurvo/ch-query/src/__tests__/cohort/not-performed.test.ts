import { describe, it, expect } from 'vitest';
import { buildNotPerformedEventSubquery } from '../../cohort/conditions/not-performed';
import type { BuildContext } from '../../cohort/types';

function makeCtx(overrides?: Partial<BuildContext>): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
    ...overrides,
  };
}

const BASE_COND = {
  type: 'not_performed_event' as const,
  event_name: 'purchase',
  time_window_days: 90,
};

describe('buildNotPerformedEventSubquery — upper bound always applied', () => {
  it('rolling-window mode (no dateFrom): always includes timestamp <= upperBound', () => {
    // Bug: previously upperBoundFilter was '' when lowerBound was undefined,
    // so events after dateTo could falsely exclude users.
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = buildNotPerformedEventSubquery(BASE_COND, ctx);

    // Upper bound must always be present so post-period events are excluded
    expect(sql).toContain('AND timestamp <= {coh_date_to:DateTime64(3)}');
    // Lower bound should use the rolling expression (dateTo - N days)
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_days:UInt32} DAY');
  });

  it('fixed-window mode (dateFrom + dateTo): includes both bounds', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = buildNotPerformedEventSubquery(BASE_COND, ctx);

    // Lower bound: dateFrom
    expect(sql).toContain('AND timestamp >= {coh_date_from:DateTime64(3)}');
    // Upper bound: dateTo (always present after the fix)
    expect(sql).toContain('AND timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('no dates at all (cohort-worker mode): uses now64(3) as upper bound', () => {
    const ctx = makeCtx();
    const sql = buildNotPerformedEventSubquery(BASE_COND, ctx);

    // Upper bound is now64(3) in the absence of any date context
    expect(sql).toContain('AND timestamp <= now64(3)');
    // Lower bound: now64(3) - N days
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_days:UInt32} DAY');
  });

  it('rolling-window mode: upper bound references same dateTo param used by lower', () => {
    const ctx = makeCtx({ dateTo: '2025-03-01 00:00:00' });
    buildNotPerformedEventSubquery(BASE_COND, ctx);

    // The coh_date_to param must be stored and referenced correctly
    expect(ctx.queryParams['coh_date_to']).toBe('2025-03-01 00:00:00');
  });

  it('fixed-window mode: params include both coh_date_from and coh_date_to', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    buildNotPerformedEventSubquery(BASE_COND, ctx);

    expect(ctx.queryParams['coh_date_to']).toBe('2025-01-31 23:59:59');
    expect(ctx.queryParams['coh_date_from']).toBe('2025-01-01 00:00:00');
  });

  it('generated SQL contains the event name param for countIf', () => {
    const ctx = makeCtx();
    const sql = buildNotPerformedEventSubquery(BASE_COND, ctx);

    expect(sql).toContain('HAVING countIf(event_name = {coh_0_event:String}) = 0');
    expect(ctx.queryParams['coh_0_event']).toBe('purchase');
    expect(ctx.queryParams['coh_0_days']).toBe(90);
  });
});
