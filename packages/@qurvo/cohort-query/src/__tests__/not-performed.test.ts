import { describe, it, expect } from 'vitest';
import { buildNotPerformedEventSubquery } from '../conditions/not-performed';
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

/** Extract compiled params from a node */
function params(node: ReturnType<typeof buildNotPerformedEventSubquery>) {
  return compile(node).params;
}

const BASE_COND = {
  type: 'not_performed_event' as const,
  event_name: 'purchase',
  time_window_days: 90,
};

describe('buildNotPerformedEventSubquery — upper bound always applied', () => {
  it('rolling-window mode (no dateFrom): always includes timestamp <= upperBound', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = compile(buildNotPerformedEventSubquery(BASE_COND, ctx)).sql;

    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_days:UInt32} DAY');
  });

  it('fixed-window mode (dateFrom + dateTo): includes both bounds', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = compile(buildNotPerformedEventSubquery(BASE_COND, ctx)).sql;

    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('no dates at all (cohort-worker mode): uses now64(3) as upper bound', () => {
    const ctx = makeCtx();
    const sql = compile(buildNotPerformedEventSubquery(BASE_COND, ctx)).sql;

    expect(sql).toContain('timestamp <= now64(3)');
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_days:UInt32} DAY');
  });

  it('rolling-window mode: upper bound references same dateTo param used by lower', () => {
    const ctx = makeCtx({ dateTo: '2025-03-01 00:00:00' });
    const node = buildNotPerformedEventSubquery(BASE_COND, ctx);
    const p = params(node);

    expect(p['coh_date_to']).toBe('2025-03-01 00:00:00');
  });

  it('fixed-window mode: params include both coh_date_from and coh_date_to', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const node = buildNotPerformedEventSubquery(BASE_COND, ctx);
    const p = params(node);

    expect(p['coh_date_to']).toBe('2025-01-31 23:59:59');
    expect(p['coh_date_from']).toBe('2025-01-01 00:00:00');
  });

  it('generated SQL contains the event name param for countIf', () => {
    const ctx = makeCtx();
    const node = buildNotPerformedEventSubquery(BASE_COND, ctx);
    const { sql, params: p } = compile(node);

    expect(sql).toContain('HAVING countIf(event_name = {coh_0_event:String}) = 0');
    expect(p['coh_0_event']).toBe('purchase');
    expect(p['coh_0_days']).toBe(90);
  });
});
