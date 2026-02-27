import { describe, it, expect } from 'vitest';
import { buildStoppedPerformingSubquery } from '../conditions/stopped';
import { buildRestartedPerformingSubquery } from '../conditions/restarted';
import type { BuildContext } from '../types';

function makeCtx(): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
  };
}

// ── stopped_performing guard ─────────────────────────────────────────────────

describe('buildStoppedPerformingSubquery — window guard', () => {
  it('throws when recent_window_days >= historical_window_days (equal)', () => {
    expect(() =>
      buildStoppedPerformingSubquery(
        { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 30, historical_window_days: 30 },
        makeCtx(),
      ),
    ).toThrow(/recent_window_days.*must be less than.*historical_window_days/i);
  });

  it('throws when recent_window_days > historical_window_days', () => {
    expect(() =>
      buildStoppedPerformingSubquery(
        { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 60, historical_window_days: 30 },
        makeCtx(),
      ),
    ).toThrow(/stopped_performing/);
  });

  it('returns a SQL string when recent_window_days < historical_window_days', () => {
    const sql = buildStoppedPerformingSubquery(
      { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 7, historical_window_days: 30 },
      makeCtx(),
    );
    expect(sql).toContain('SELECT');
    expect(sql).toContain('person_id');
  });
});

// ── restarted_performing guard ───────────────────────────────────────────────

describe('buildRestartedPerformingSubquery — window guard', () => {
  it('throws when historical_window_days === recent + gap', () => {
    // recent=7, gap=14 → sum=21; historical=21 is invalid (must be > 21)
    expect(() =>
      buildRestartedPerformingSubquery(
        {
          type: 'restarted_performing',
          event_name: 'page_view',
          recent_window_days: 7,
          gap_window_days: 14,
          historical_window_days: 21,
        },
        makeCtx(),
      ),
    ).toThrow(/historical_window_days.*must be greater than/i);
  });

  it('throws when historical_window_days < recent + gap', () => {
    // recent=7, gap=14 → sum=21; historical=10 < 21 → invalid
    expect(() =>
      buildRestartedPerformingSubquery(
        {
          type: 'restarted_performing',
          event_name: 'page_view',
          recent_window_days: 7,
          gap_window_days: 14,
          historical_window_days: 10,
        },
        makeCtx(),
      ),
    ).toThrow(/restarted_performing/);
  });

  it('returns a SQL string when historical_window_days > recent + gap', () => {
    const sql = buildRestartedPerformingSubquery(
      {
        type: 'restarted_performing',
        event_name: 'page_view',
        recent_window_days: 7,
        gap_window_days: 14,
        historical_window_days: 30,
      },
      makeCtx(),
    );
    expect(sql).toContain('SELECT');
    expect(sql).toContain('person_id');
  });
});
