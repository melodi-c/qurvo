import { describe, it, expect } from 'vitest';
import { buildEventSequenceSubquery } from '../conditions/sequence';
import { buildNotPerformedEventSequenceSubquery } from '../conditions/not-performed-sequence';
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
function params(node: ReturnType<typeof buildEventSequenceSubquery>) {
  return compile(node).params;
}

describe('buildSequenceCore — array-based sequence detection', () => {
  it('uses arrayFold for sequence detection instead of sequenceMatch', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).not.toContain('sequenceMatch');
    expect(sql).toContain('arrayFold');
    expect(sql).toContain('toUnixTimestamp64Milli(timestamp)');
    expect(sql).toContain('arraySort');
  });

  it('classifies events into step indices via multiIf', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('multiIf(');
    expect(sql).toContain('{coh_0_seq_0:String}');
    expect(sql).toContain('{coh_0_seq_1:String}');
  });

  it('filters out non-matching events (step_idx > 0)', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('step_idx > 0');
  });

  it('window_ms param is set to time_window_days * 86_400_000', () => {
    const ctx = makeCtx();
    const node = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    expect(params(node)['coh_0_window_ms']).toBe(7 * 86_400_000);
    expect(params(node)['coh_0_days']).toBe(7);
  });

  it('window_ms param reflects correct value for 30-day window', () => {
    const ctx = makeCtx();
    const node = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 30,
      },
      ctx,
    );

    expect(params(node)['coh_0_window_ms']).toBe(30 * 86_400_000);
  });

  it('single-step sequence still works with arrayFold', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'signup' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('arrayFold');
    expect(sql).toContain('> 1');
  });

  it('3-step sequence checks acc.1 > 3', () => {
    const ctx = makeCtx();
    const node = buildEventSequenceSubquery(
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
    const { sql, params: p } = compile(node);

    expect(sql).toContain('> 3');
    expect(p['coh_0_seq_0']).toBe('pageview');
    expect(p['coh_0_seq_1']).toBe('add_to_cart');
    expect(p['coh_0_seq_2']).toBe('purchase');
  });

  it('multiple conditions use distinct param names', () => {
    const ctx = makeCtx();

    const node1 = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    );

    const node2 = buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'c' }, { event_name: 'd' }],
        time_window_days: 14,
      },
      ctx,
    );

    expect(params(node1)['coh_0_window_ms']).toBe(7 * 86_400_000);
    expect(params(node2)['coh_1_window_ms']).toBe(14 * 86_400_000);
  });

  it('not-performed-sequence also uses arrayFold', () => {
    const ctx = makeCtx();
    const node = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 7,
      },
      ctx,
    );
    const { sql, params: p } = compile(node);

    expect(sql).not.toContain('sequenceMatch');
    expect(sql).toContain('arrayFold');
    expect(sql).toContain('toUnixTimestamp64Milli(timestamp)');
    expect(p['coh_0_window_ms']).toBe(7 * 86_400_000);
  });

  it('WHERE scan horizon still uses INTERVAL {daysPk} DAY', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('INTERVAL {coh_0_days:UInt32} DAY');
  });

  it('event_sequence checks seq_match = 1 (performed)', () => {
    const ctx = makeCtx();
    const sql = compile(buildEventSequenceSubquery(
      {
        type: 'event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('seq_match = 1');
  });

  it('not-performed-sequence checks seq_match = 0', () => {
    const ctx = makeCtx();
    const sql = compile(buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('seq_match = 0');
  });
});

// ── not_performed_event_sequence — dateFrom/dateTo window adaptation ──────────

describe('buildNotPerformedEventSequenceSubquery — dateFrom/dateTo window', () => {
  it('rolling-window mode (no dateFrom): uses dateTo - INTERVAL N DAY as lower bound', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = compile(buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 30,
      },
      ctx,
    )).sql;

    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_days:UInt32} DAY');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('fixed-window mode (dateFrom + dateTo): uses two-window NOT IN approach', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = compile(buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'signup' }, { event_name: 'purchase' }],
        time_window_days: 30,
      },
      ctx,
    )).sql;

    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(sql).toContain('- INTERVAL {coh_0_days:UInt32} DAY');
    expect(sql).toContain('NOT IN');
  });

  it('no dates (cohort-worker mode): uses now64(3) as both upper and rolling lower bound', () => {
    const ctx = makeCtx();
    const sql = compile(buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 7,
      },
      ctx,
    )).sql;

    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_days:UInt32} DAY');
    expect(sql).toContain('timestamp <= now64(3)');
  });

  it('fixed-window mode: stores both coh_date_from and coh_date_to in compiled params', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const node = buildNotPerformedEventSequenceSubquery(
      {
        type: 'not_performed_event_sequence',
        steps: [{ event_name: 'a' }, { event_name: 'b' }],
        time_window_days: 30,
      },
      ctx,
    );
    const p = params(node);

    expect(p['coh_date_to']).toBe('2025-01-31 23:59:59');
    expect(p['coh_date_from']).toBe('2025-01-01 00:00:00');
  });
});
