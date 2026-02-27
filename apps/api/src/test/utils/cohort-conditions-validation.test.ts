import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CohortStoppedPerformingConditionDto,
  CohortRestartedPerformingConditionDto,
} from '../../api/dto/cohort-conditions.dto';

// ── stopped_performing ───────────────────────────────────────────────────────

describe('CohortStoppedPerformingConditionDto — window semantics', () => {
  function buildStopped(recent: number, historical: number) {
    return plainToInstance(CohortStoppedPerformingConditionDto, {
      type: 'stopped_performing',
      event_name: 'page_view',
      recent_window_days: recent,
      historical_window_days: historical,
    });
  }

  it('passes when recent < historical', async () => {
    const errors = await validate(buildStopped(7, 30));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors).toHaveLength(0);
  });

  it('fails when recent === historical', async () => {
    const errors = await validate(buildStopped(30, 30));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
    expect(windowErrors[0].constraints).toMatchObject({
      isLessThan: expect.stringContaining('recent_window_days must be less than historical_window_days'),
    });
  });

  it('fails when recent > historical', async () => {
    const errors = await validate(buildStopped(60, 30));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
  });

  it('passes with minimal valid values (recent=1, historical=2)', async () => {
    const errors = await validate(buildStopped(1, 2));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors).toHaveLength(0);
  });
});

// ── restarted_performing ─────────────────────────────────────────────────────

describe('CohortRestartedPerformingConditionDto — window semantics', () => {
  function buildRestarted(recent: number, gap: number, historical: number) {
    return plainToInstance(CohortRestartedPerformingConditionDto, {
      type: 'restarted_performing',
      event_name: 'page_view',
      recent_window_days: recent,
      gap_window_days: gap,
      historical_window_days: historical,
    });
  }

  it('passes when historical > recent + gap', async () => {
    const errors = await validate(buildRestarted(7, 14, 30));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors).toHaveLength(0);
  });

  it('fails when historical === recent + gap', async () => {
    // recent=7, gap=14 → historical must be > 21; 21 is invalid
    const errors = await validate(buildRestarted(7, 14, 21));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
    expect(windowErrors[0].constraints).toMatchObject({
      isGreaterThanSum: expect.stringContaining('historical_window_days must be greater than recent_window_days + gap_window_days'),
    });
  });

  it('fails when historical < recent + gap', async () => {
    // recent=7, gap=14 → sum=21; historical=10 < 21 → invalid
    const errors = await validate(buildRestarted(7, 14, 10));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
  });

  it('passes with minimal valid values (recent=1, gap=1, historical=3)', async () => {
    const errors = await validate(buildRestarted(1, 1, 3));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors).toHaveLength(0);
  });

  it('fails with equal boundary (recent=1, gap=1, historical=2)', async () => {
    const errors = await validate(buildRestarted(1, 1, 2));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
  });
});
