import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/**
 * Tests for issue #594: orphan last-step event before any step-0 event
 * produces first_step_ms=0, which passes the old avgIf guard
 * (last_step_ms > first_step_ms === orphan_ts > 0 === true) and pollutes
 * avg_time_to_convert with billions of seconds (Unix epoch timestamp).
 *
 * Fix: add `first_step_ms > 0` to the avgIf guard so that users with
 * no valid anchor are excluded from avg_time_to_convert.
 */
describe('queryFunnel — orphan last-step event does not pollute avg_time_to_convert (issue #594)', () => {
  it('ordered: orphan last-step before any step-0 is excluded from avg_time', async () => {
    // Scenario from issue #594:
    //   Funnel: A -> B, window = 7 days, analysis Jan 1-Jan 31
    //   userA: B at T-20d (orphan), A at T-10d, B at T-9d (valid conversion)
    //   userB: A at T-5d, B at T-3d (valid conversion, 2 days)
    //
    // userA's orphan B at T-20d is the global minIf(lastStepCond) = T-20d.
    // No t0 satisfies t0 <= T-20d AND T-20d <= t0 + 7d because the only
    // t0 is at T-10d (which is after T-20d).
    // So first_step_ms = 0 for userA's orphan path.
    //
    // Without fix: avgIf condition (last_step_ms > first_step_ms) = (T-20d_ms > 0) = true
    //   -> avg includes T-20d_ms / 1000 ≈ billions of seconds (garbage)
    //
    // With fix: avgIf condition includes first_step_ms > 0 -> userA's orphan is excluded.
    // The valid conversion (A at T-10d -> B at T-9d = 1 day) should still be counted
    // because last_step_ms = minIf picks T-20d (orphan), not T-9d.
    // Actually, last_step_ms = min(T-20d, T-9d) = T-20d, and no t0 <= T-20d exists,
    // so first_step_ms = 0 for userA entirely -> userA excluded from avg.
    //
    // Only userB contributes: avg ≈ 2 days.
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // userA: orphan last-step event (B before any A)
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'step_b',
        timestamp: new Date(now - 20 * DAY_MS).toISOString(),
      }),
      // userA: valid funnel attempt (A -> B within 7d window)
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'step_a',
        timestamp: new Date(now - 10 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'step_b',
        timestamp: new Date(now - 9 * DAY_MS).toISOString(),
      }),
      // userB: simple valid conversion (2 days)
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'step_a',
        timestamp: new Date(now - 5 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'step_b',
        timestamp: new Date(now - 3 * DAY_MS).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-25),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Both users entered step A; both have windowFunnel max_step >= 2 (converted)
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);

    // avg_time must not be polluted with billions of seconds.
    // With the fix, userA's orphan last_step causes first_step_ms=0, which is excluded.
    // Only userB's 2-day conversion contributes.
    // Without the fix, the avg would be astronomical (epoch timestamp / 1000).
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    // userB has a clean 2-day conversion, so avgTime MUST be non-null.
    // The conditional `if (avgTime !== null)` was hiding potential regressions.
    expect(avgTime).not.toBeNull();
    // Expected: ~2 days = 172800s. Allow range [1 day .. 3 days] for timing jitter.
    expect(avgTime!).toBeGreaterThan(DAY_MS / 1000);       // > 1 day
    expect(avgTime!).toBeLessThan(3 * DAY_MS / 1000);      // < 3 days

    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('ordered: user with ONLY an orphan last-step (no step-0 at all) does not affect avg_time', async () => {
    // userA: only has step_b events, no step_a at all
    // userB: valid conversion step_a -> step_b, 30s apart
    //
    // userA should not enter the funnel (windowFunnel returns 0 steps).
    // avg_time should reflect only userB's 30s.
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // userA: only last-step event (orphan)
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'orphan-only',
        event_name: 'step_b',
        timestamp: msAgo(60_000),
      }),
      // userB: valid conversion
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'valid-user',
        event_name: 'step_a',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'valid-user',
        event_name: 'step_b',
        timestamp: msAgo(30_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Only userB entered step A
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);

    // avg_time should be ~30s (userB's conversion), not polluted
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(0);
    expect(avgTime!).toBeCloseTo(30, 0);

    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('strict mode: orphan last-step before step-0 is excluded from avg_time', async () => {
    // Same scenario but with strict mode.
    // userA: orphan B at T-50s, then A at T-30s, B at T-20s
    // userB: A at T-40s, B at T-10s (30s conversion)
    //
    // In strict mode, the orphan B at T-50s causes last_step_ms = min(T-50s, T-20s) = T-50s
    // No t0 <= T-50s → first_step_ms = 0 → excluded from avg by the guard.
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // userA: orphan last-step
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'strict-orphan',
        event_name: 'step_b',
        timestamp: msAgo(50_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'strict-orphan',
        event_name: 'step_a',
        timestamp: msAgo(30_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'strict-orphan',
        event_name: 'step_b',
        timestamp: msAgo(20_000),
      }),
      // userB: valid conversion
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'strict-valid',
        event_name: 'step_a',
        timestamp: msAgo(40_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'strict-valid',
        event_name: 'step_b',
        timestamp: msAgo(10_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Both users converted
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);

    // avg_time should be reasonable (not billions of seconds).
    // If the bug were present, userA's orphan would contribute epoch-level garbage.
    // userB has a clean 30s conversion, so avgTime MUST be non-null.
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(0);
    expect(avgTime!).toBeLessThan(100); // should be at most tens of seconds

    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });
});
