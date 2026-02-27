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

describe('buildSequenceCore — array-based sequence detection', () => {
  it('uses arrayFold for sequence detection instead of sequenceMatch', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    );

    // Must NOT use sequenceMatch (which requires DateTime and loses milliseconds)
    expect(sql).not.toContain('sequenceMatch');
    // Must use arrayFold for ordered sequence detection
    expect(sql).toContain('arrayFold');
    // Must use toUnixTimestamp64Milli to preserve millisecond precision
    expect(sql).toContain('toUnixTimestamp64Milli(timestamp)');
    // Must use arraySort for deterministic ordering
    expect(sql).toContain('arraySort');
  });

  it('classifies events into step indices via multiIf', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    );

    // multiIf maps events to 1-based step indices
    expect(sql).toContain('multiIf(');
    expect(sql).toContain('{coh_0_seq_0:String}');
    expect(sql).toContain('{coh_0_seq_1:String}');
  });

  it('filters out non-matching events (step_idx > 0)', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).toContain('WHERE step_idx > 0');
  });

  it('window_ms param is set to time_window_days * 86_400_000', () => {
    const ctx = makeCtx();
    buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(ctx.queryParams['coh_0_window_ms']).toBe(7 * 86_400_000);
    expect(ctx.queryParams['coh_0_days']).toBe(7);
  });

  it('window_ms param reflects correct value for 30-day window', () => {
    const ctx = makeCtx();
    buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 30,
      },
      ctx,
    );

    expect(ctx.queryParams['coh_0_window_ms']).toBe(30 * 86_400_000);
  });

  it('single-step sequence still works with arrayFold', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }],
        time_window_days: 7,
      },
      ctx,
    );

    // Single step: arrayFold checks acc.1 > 1 (one step matched)
    expect(sql).toContain('arrayFold');
    expect(sql).toContain('> 1');
  });

  it('3-step sequence checks acc.1 > 3', () => {
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

    expect(sql).toContain('> 3');
    // All 3 step event params should be registered
    expect(ctx.queryParams['coh_0_seq_0']).toBe('pageview');
    expect(ctx.queryParams['coh_0_seq_1']).toBe('add_to_cart');
    expect(ctx.queryParams['coh_0_seq_2']).toBe('purchase');
  });

  it('multiple conditions use distinct param names', () => {
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

    expect(ctx.queryParams['coh_0_window_ms']).toBe(7 * 86_400_000);
    expect(ctx.queryParams['coh_1_window_ms']).toBe(14 * 86_400_000);
  });

  it('not-performed-sequence also uses arrayFold', () => {
    const ctx = makeCtx();
    const sql = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).not.toContain('sequenceMatch');
    expect(sql).toContain('arrayFold');
    expect(sql).toContain('toUnixTimestamp64Milli(timestamp)');
    expect(ctx.queryParams['coh_0_window_ms']).toBe(7 * 86_400_000);
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

  it('event_sequence checks seq_match = 1 (performed)', () => {
    const ctx = makeCtx();
    const sql = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).toContain('WHERE seq_match = 1');
  });

  it('not-performed-sequence checks seq_match = 0', () => {
    const ctx = makeCtx();
    const sql = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(sql).toContain('WHERE seq_match = 0');
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
