import { describe, it, expect } from 'vitest';
import { buildEventSequenceSubquery } from '../conditions/sequence';
import { buildNotPerformedEventSequenceSubquery } from '../conditions/not-performed-sequence';
import type { BuildContext } from '../types';

function makeCtx(overrides?: Partial<BuildContext>): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
    ...overrides,
  };
}

describe('buildSequenceCore — inter-step time constraint', () => {
  it('2-step pattern includes (?t<=N) time constraint between steps', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    );

    // Pattern must include time constraint, not bare .*
    expect(sql).toContain('(?1)(?t<={coh_0_window_seconds:UInt64})(?2)');
    expect(sql).not.toContain('(?1).*(?2)');
  });

  it('3-step pattern includes (?t<=N) between each consecutive pair', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [
          { event_name: 'pageview' },
          { event_name: 'add_to_cart' },
          { event_name: 'purchase' },
        ],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).toContain('(?1)(?t<={coh_0_window_seconds:UInt64})(?2)(?t<={coh_0_window_seconds:UInt64})(?3)');
    expect(sql).not.toContain('.*');
  });

  it('window_seconds param is set to time_window_days * 86400', () => {
    const ctx = makeCtx();
    buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(ctx.queryParams['coh_0_window_seconds']).toBe(7 * 86400);
    expect(ctx.queryParams['coh_0_days']).toBe(7);
  });

  it('window_seconds param reflects correct value for 30-day window', () => {
    const ctx = makeCtx();
    buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 30,
      },
      ctx,
    );

    expect(ctx.queryParams['coh_0_window_seconds']).toBe(30 * 86400);
  });

  it('single-step pattern has no time constraint token (no pair to constrain)', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }],
        time_window_days: 7,
      },
      ctx,
    );

    // A single step has nothing to join with — pattern is just '(?1)'
    expect(sql).toContain('(?1)');
    expect(sql).not.toContain('(?t<=');
    expect(sql).not.toContain('.*');
  });

  it('multiple conditions use distinct window_seconds param names', () => {
    const ctx = makeCtx();

    buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'c' }, { event_name: 'd' }],
        time_window_days: 14,
      },
      ctx,
    );

    expect(ctx.queryParams['coh_0_window_seconds']).toBe(7 * 86400);
    expect(ctx.queryParams['coh_1_window_seconds']).toBe(14 * 86400);
  });

  it('not-performed-sequence also uses inter-step time constraint', () => {
    const ctx = makeCtx();
    const sql = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).toContain('(?1)(?t<={coh_0_window_seconds:UInt64})(?2)');
    expect(sql).not.toContain('(?1).*(?2)');
    expect(ctx.queryParams['coh_0_window_seconds']).toBe(7 * 86400);
  });

  it('WHERE scan horizon still uses INTERVAL {daysPk} DAY', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    // The WHERE clause must still bound the overall scan window
    expect(sql).toContain('INTERVAL {coh_0_days:UInt32} DAY');
  });
});

// ── not_performed_event_sequence — dateFrom/dateTo window adaptation ──────────

describe('buildNotPerformedEventSequenceSubquery — dateFrom/dateTo window', () => {
  it('rolling-window mode (no dateFrom): uses dateTo - INTERVAL N DAY as lower bound', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 30,
      },
      ctx,
    );

    // Lower bound: dateTo - N days (rolling window)
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_days:UInt32} DAY');
    // Upper bound must always be present
    expect(sql).toContain('AND timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('fixed-window mode (dateFrom + dateTo): uses dateFrom as lower bound', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 30,
      },
      ctx,
    );

    // Lower bound must be dateFrom, not a rolling expression
    expect(sql).toContain('AND timestamp >= {coh_date_from:DateTime64(3)}');
    // Upper bound must be dateTo
    expect(sql).toContain('AND timestamp <= {coh_date_to:DateTime64(3)}');
    // Must NOT use rolling window when dateFrom is present
    expect(sql).not.toContain('- INTERVAL {coh_0_days:UInt32} DAY');
  });

  it('no dates (cohort-worker mode): uses now64(3) as both upper and rolling lower bound', () => {
    const ctx = makeCtx();
    const sql = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_days:UInt32} DAY');
    expect(sql).toContain('AND timestamp <= now64(3)');
  });

  it('fixed-window mode: stores both coh_date_from and coh_date_to in queryParams', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 30,
      },
      ctx,
    );

    expect(ctx.queryParams['coh_date_to']).toBe('2025-01-31 23:59:59');
    expect(ctx.queryParams['coh_date_from']).toBe('2025-01-01 00:00:00');
  });
});
