import { describe, it, expect } from 'vitest';
import { buildStoppedPerformingSubquery } from '../../cohort/conditions/stopped';
import { buildRestartedPerformingSubquery } from '../../cohort/conditions/restarted';
import { compile } from '../../compiler';
import { CohortQueryValidationError } from '../../cohort/errors';
import type { BuildContext } from '../../cohort/types';

function makeCtx(): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
  };
}

// ── stopped_performing guard ─────────────────────────────────────────────────

describe('buildStoppedPerformingSubquery — window guard', () => {
  it('throws CohortQueryValidationError when recent_window_days >= historical_window_days (equal)', () => {
    expect(() =>
      buildStoppedPerformingSubquery(
        { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 30, historical_window_days: 30 },
        makeCtx(),
      ),
    ).toThrow(CohortQueryValidationError);
  });

  it('throws with correct message when recent_window_days >= historical_window_days (equal)', () => {
    expect(() =>
      buildStoppedPerformingSubquery(
        { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 30, historical_window_days: 30 },
        makeCtx(),
      ),
    ).toThrow(/recent_window_days.*must be less than.*historical_window_days/i);
  });

  it('throws CohortQueryValidationError when recent_window_days > historical_window_days', () => {
    expect(() =>
      buildStoppedPerformingSubquery(
        { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 60, historical_window_days: 30 },
        makeCtx(),
      ),
    ).toThrow(CohortQueryValidationError);
  });

  it('throws with correct message when recent_window_days > historical_window_days', () => {
    expect(() =>
      buildStoppedPerformingSubquery(
        { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 60, historical_window_days: 30 },
        makeCtx(),
      ),
    ).toThrow(/stopped_performing/);
  });

  it('returns a SelectNode that compiles to valid SQL when recent_window_days < historical_window_days', () => {
    const node = buildStoppedPerformingSubquery(
      { type: 'stopped_performing', event_name: 'page_view', recent_window_days: 7, historical_window_days: 30 },
      makeCtx(),
    );
    const sql = compile(node).sql;
    expect(sql).toContain('SELECT');
    expect(sql).toContain('person_id');
  });
});

// ── restarted_performing guard ───────────────────────────────────────────────

describe('buildRestartedPerformingSubquery — window guard', () => {
  it('throws CohortQueryValidationError when historical_window_days === recent + gap', () => {
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
    ).toThrow(CohortQueryValidationError);
  });

  it('throws with correct message when historical_window_days === recent + gap', () => {
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

  it('throws CohortQueryValidationError when historical_window_days < recent + gap', () => {
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
    ).toThrow(CohortQueryValidationError);
  });

  it('throws with correct message when historical_window_days < recent + gap', () => {
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

  it('returns a SelectNode that compiles to valid SQL when historical_window_days > recent + gap', () => {
    const node = buildRestartedPerformingSubquery(
      {
        type: 'restarted_performing',
        event_name: 'page_view',
        recent_window_days: 7,
        gap_window_days: 14,
        historical_window_days: 30,
      },
      makeCtx(),
    );
    const sql = compile(node).sql;
    expect(sql).toContain('SELECT');
    expect(sql).toContain('person_id');
  });
});
