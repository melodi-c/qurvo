import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/**
 * Tests for ordered funnel avg_time_to_convert when a user has multiple funnel attempts.
 *
 * Bug (issue #493): first_step_ms was computed as the global minIf across the entire
 * date range, not the specific step_0 that started the successful conversion window.
 *
 * Scenario:
 *   - Query: Jan 1 – Mar 1, window = 7 days, 2 steps
 *   - User: step_0 = Jan 1 (no step_1 within 7 days → failed attempt)
 *           step_0 = Feb 1, step_1 = Feb 3 (within 7 days → successful attempt)
 *   - Old (buggy): first_step_ms = Jan 1, last_step_ms = Feb 3 → ~33 days
 *   - Fixed: first_step_ms = Feb 1, last_step_ms = Feb 3 → ~2 days
 */

describe('queryFunnel — ordered funnel avg_time_to_convert with multiple attempts (issue #493)', () => {
  it('uses the successful-attempt anchor for first_step_ms, not the earliest step_0 ever', async () => {
    // Window = 7 days.
    // Attempt 1: step_0 at T-34d (failed — step_1 is 32 days later, outside window)
    // Attempt 2: step_0 at T-2d, step_1 at T (2 days — inside 7d window, successful)
    // Expected avg_time ≈ 2 days, NOT 34 days.
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    const stepOneTime = now;
    const attempt2Step0 = now - 2 * DAY_MS;   // 2 days before step_1
    const attempt1Step0 = now - 34 * DAY_MS;  // 34 days before step_1, 32 days before step_1

    await insertTestEvents(ctx.ch, [
      // Failed attempt: step_0 at T-34d (step_1 is 34 days later — outside 7-day window)
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'multi-attempt-user',
        event_name: 'signup',
        timestamp: new Date(attempt1Step0).toISOString(),
      }),
      // Successful attempt: step_0 at T-2d
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'multi-attempt-user',
        event_name: 'signup',
        timestamp: new Date(attempt2Step0).toISOString(),
      }),
      // step_1 at T — within window of attempt 2 (2 days) but not attempt 1 (34 days)
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'multi-attempt-user',
        event_name: 'purchase',
        timestamp: new Date(stepOneTime).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-40),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // User entered and converted (windowFunnel correctly finds the 7-day window from attempt 2)
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);

    // avg_time should reflect ~2 days (successful window), not ~34 days (failed first attempt)
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    // Should be roughly 2 days in seconds (with tolerance for test timing)
    expect(avgTime!).toBeGreaterThan(1 * DAY_MS / 1000);   // > 1 day
    expect(avgTime!).toBeLessThan(4 * DAY_MS / 1000);      // < 4 days (not the 34-day span)

    // Last step always returns null
    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('single-attempt user is not affected by the fix', async () => {
    // User with exactly one step_0 and one step_1 — the two-CTE approach
    // should give the same result as before (no regressions).
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    const step0Time = now - 3 * DAY_MS;
    const step1Time = now;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'single-attempt',
        event_name: 'signup',
        timestamp: new Date(step0Time).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'single-attempt',
        event_name: 'purchase',
        timestamp: new Date(step1Time).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-10),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);

    // avg_time should be ~3 days
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(2 * DAY_MS / 1000);
    expect(avgTime!).toBeLessThan(4 * DAY_MS / 1000);

    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('two users: one with multiple attempts, one with single attempt — averages correctly', async () => {
    // userA: step_0 at T-10d (fails, no step_1 within 7d), step_0 at T-2d, step_1 at T
    //   correct first_step_ms = T-2d, avg_time = 2 days
    // userB: single step_0 at T-4d, step_1 at T
    //   avg_time = 4 days
    // Expected overall avg: (2 + 4) / 2 = 3 days
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    const now = Date.now();
    const t = now;

    await insertTestEvents(ctx.ch, [
      // userA: early failed attempt
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'signup',
        timestamp: new Date(t - 10 * DAY_MS).toISOString(),
      }),
      // userA: successful attempt
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'signup',
        timestamp: new Date(t - 2 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        timestamp: new Date(t).toISOString(),
      }),
      // userB: single attempt
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'signup',
        timestamp: new Date(t - 4 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        timestamp: new Date(t).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-15),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);

    // avg should be ~3 days (userA=2d, userB=4d average)
    // If bug were present, userA would contribute ~10 days → avg ~7 days
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(2 * DAY_MS / 1000);   // > 2 days
    expect(avgTime!).toBeLessThan(5 * DAY_MS / 1000);      // < 5 days (not 7+ from buggy version)

    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('3-step ordered funnel: multiple attempts with failed first attempt', async () => {
    // 3-step funnel: signup → onboarding → purchase, window = 7 days
    // Attempt 1: signup at T-20d, onboarding at T-15d (5d gap — ok), purchase at T (20d gap — outside window)
    // Attempt 2: signup at T-5d, onboarding at T-3d, purchase at T → all within 7d window
    // Expected: converts with avg_time ≈ 5 days (from T-5d signup to T purchase)
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    const t = now;

    await insertTestEvents(ctx.ch, [
      // Attempt 1 (fails — purchase is outside 7-day window from signup)
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'signup',
        timestamp: new Date(t - 20 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'onboarding',
        timestamp: new Date(t - 15 * DAY_MS).toISOString(),
      }),
      // Attempt 2 (successful — all within 7 days)
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'signup',
        timestamp: new Date(t - 5 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'onboarding',
        timestamp: new Date(t - 3 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'purchase',
        timestamp: new Date(t).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'onboarding', label: 'Onboarding' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-25),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[2].count).toBe(1);

    // avg_time should reflect ~5 days (signup at T-5d to purchase at T)
    // NOT ~20 days (earliest signup at T-20d to purchase)
    const step0Avg = r.steps[0].avg_time_to_convert_seconds;
    const step1Avg = r.steps[1].avg_time_to_convert_seconds;
    expect(step0Avg).not.toBeNull();
    expect(step1Avg).not.toBeNull();
    // Both steps show the same total conversion time (step_0 → step_N)
    expect(step0Avg!).toBeGreaterThan(4 * DAY_MS / 1000);   // > 4 days
    expect(step0Avg!).toBeLessThan(7 * DAY_MS / 1000);      // < 7 days (not 20 days)
    expect(step0Avg!).toBeCloseTo(step1Avg!, 0);

    // Last step always returns null
    expect(r.steps[2].avg_time_to_convert_seconds).toBeNull();
  });
});
