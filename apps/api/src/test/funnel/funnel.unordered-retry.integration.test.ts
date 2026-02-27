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
import { queryFunnelTimeToConvert } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── Unordered funnel: multiple attempts, first fails, second converts ─────────

describe('queryFunnel — unordered funnel repeated attempt conversion', () => {
  it('counts a user as converted when they fail on first attempt but succeed on second', async () => {
    // Scenario (7-day window):
    //   Jan 1:  step-0 (attempt 1 anchor)
    //   Jan 10: step-1 (10 days after Jan 1 → outside 7-day window → attempt 1 fails)
    //   Jan 9:  step-0 (attempt 2 anchor)
    //   Jan 10: step-1 (1 day after Jan 9 → inside 7-day window → attempt 2 succeeds)
    //
    // Old minIf+least logic: anchor = min(Jan 1, Jan 9) = Jan 1 → not converted.
    // New groupArrayIf+arrayExists logic: tries Jan 9 as anchor → converted. ✓
    const projectId = randomUUID();
    const personRetry = randomUUID();

    const now = Date.now();
    const jan10 = now - 0;                    // "today" as anchor reference
    const jan9 = jan10 - DAY_MS;              // 1 day before step-1
    const jan1 = jan10 - 9 * DAY_MS;         // 9 days before step-1

    await insertTestEvents(ctx.ch, [
      // First attempt: step-0 at jan1 (9 days before step-1)
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry-user',
        event_name: 'signup',
        timestamp: new Date(jan1).toISOString(),
      }),
      // step-1 at jan10 — within window of second attempt but outside first
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry-user',
        event_name: 'purchase',
        timestamp: new Date(jan10).toISOString(),
      }),
      // Second attempt: step-0 at jan9 (1 day before step-1)
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry-user',
        event_name: 'signup',
        timestamp: new Date(jan9).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
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

    // The user should be counted as fully converted (max_step = 2)
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].count).toBe(1); // entered step 1
    expect(r.steps[1].count).toBe(1); // completed step 2 (conversion)
    expect(r.steps[1].conversion_rate).toBe(100);
  });

  it('does not count a user as converted when both attempts fail', async () => {
    // Both step-0 occurrences are more than 7 days before step-1 — neither window covers step-1.
    const projectId = randomUUID();
    const personNoConvert = randomUUID();

    const now = Date.now();
    const stepOneTime = now;
    const attempt1 = stepOneTime - 10 * DAY_MS;   // 10 days before step-1
    const attempt2 = stepOneTime - 8 * DAY_MS;    // 8 days before step-1

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personNoConvert,
        distinct_id: 'no-convert',
        event_name: 'signup',
        timestamp: new Date(attempt1).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personNoConvert,
        distinct_id: 'no-convert',
        event_name: 'signup',
        timestamp: new Date(attempt2).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personNoConvert,
        distinct_id: 'no-convert',
        event_name: 'purchase',
        timestamp: new Date(stepOneTime).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
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

    // User entered but did not convert (step-1 always out of window for any anchor)
    expect(r.steps[0].count).toBe(1); // entered
    expect(r.steps[1].count).toBe(0); // did not convert
  });

  it('avg_time_to_convert is based on the successful window anchor, not the earliest attempt', async () => {
    // Two step-0 attempts: first at T-10d, second at T-2d.
    // step-1 at T (now).
    // Window = 7 days.
    //
    // First attempt: anchor = T-10d, step-1 at T is 10d later → outside window.
    // Second attempt: anchor = T-2d, step-1 at T is 2d later → inside window.
    //
    // avg_time should be ~2 days (from T-2d anchor to T), NOT ~10 days from T-10d anchor.
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    const stepOneTime = now;
    const secondAttempt = stepOneTime - 2 * DAY_MS;    // 2 days before step-1
    const firstAttempt = stepOneTime - 10 * DAY_MS;    // 10 days before step-1

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'avg-time-user',
        event_name: 'signup',
        timestamp: new Date(firstAttempt).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'avg-time-user',
        event_name: 'signup',
        timestamp: new Date(secondAttempt).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'avg-time-user',
        event_name: 'purchase',
        timestamp: new Date(stepOneTime).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
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

    // User converts
    expect(r.steps[1].count).toBe(1);

    // avg_time should reflect ~2 days (successful window), not ~10 days (first attempt).
    // The actual value is approximately 2 * 86400 seconds.
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    // Should be roughly 2 days in seconds (with some tolerance for test timing)
    expect(avgTime).toBeGreaterThan(1 * 86400);   // > 1 day
    expect(avgTime).toBeLessThan(4 * 86400);      // < 4 days (not 10 days from first attempt)
  });

  it('3-step unordered funnel with repeated step-0 and step-1 attempts', async () => {
    // Window = 7 days.
    // Attempt 1: step-0 at T-15d, step-1 at T-9d (6d gap - ok), step-2 at T (15d from anchor - outside)
    // Attempt 2: step-0 at T-5d, step-1 at T-3d, step-2 at T (5d from anchor - inside 7d window)
    // Expected: converted with max_step = 3
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    const t = now;
    const t_minus_3d = t - 3 * DAY_MS;
    const t_minus_5d = t - 5 * DAY_MS;
    const t_minus_9d = t - 9 * DAY_MS;
    const t_minus_15d = t - 15 * DAY_MS;

    await insertTestEvents(ctx.ch, [
      // Attempt 1: step-0 + step-1 but step-2 is too far
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'signup',
        timestamp: new Date(t_minus_15d).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'onboarding',
        timestamp: new Date(t_minus_9d).toISOString(),
      }),
      // Attempt 2: all three steps within 7 days
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'signup',
        timestamp: new Date(t_minus_5d).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'three-step-user',
        event_name: 'onboarding',
        timestamp: new Date(t_minus_3d).toISOString(),
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
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'onboarding', label: 'Onboarding' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-20),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps).toHaveLength(3);
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[2].count).toBe(1);
    expect(r.steps[2].conversion_rate).toBe(100);
  });

  it('mixed: one user converts on retry, another does not convert at all', async () => {
    // personRetry: step-0 at T-10d (fails), step-0 at T-2d (succeeds)
    //              step-1 at T (within 7d of second attempt)
    // personNever: only has step-0 (no step-1 at all)
    // Expected: step1.count = 2, step2.count = 1
    const projectId = randomUUID();
    const personRetry = randomUUID();
    const personNever = randomUUID();

    const now = Date.now();
    const t = now;
    const t_minus_2d = t - 2 * DAY_MS;
    const t_minus_10d = t - 10 * DAY_MS;

    await insertTestEvents(ctx.ch, [
      // personRetry: two signup attempts, then purchase
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry',
        event_name: 'signup',
        timestamp: new Date(t_minus_10d).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry',
        event_name: 'signup',
        timestamp: new Date(t_minus_2d).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry',
        event_name: 'purchase',
        timestamp: new Date(t).toISOString(),
      }),
      // personNever: only signup
      buildEvent({
        project_id: projectId,
        person_id: personNever,
        distinct_id: 'never',
        event_name: 'signup',
        timestamp: new Date(t_minus_2d).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
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

    expect(r.steps[0].count).toBe(2); // both entered
    expect(r.steps[1].count).toBe(1); // only personRetry converted
    expect(r.steps[1].conversion_rate).toBe(50);
  });
});

// ── Unordered TTC: avg_time measured from successful window anchor ────────────

describe('queryFunnelTimeToConvert — unordered funnel repeated attempt TTC', () => {
  it('measures TTC from the successful attempt anchor, not the earliest step-0', async () => {
    // Two users, both with repeated step-0 attempts.
    //
    // userA: step-0 at T-10d (first attempt, fails), step-0 at T-2d (second attempt),
    //        step-1 at T (2 days from second anchor → TTC ≈ 2 days)
    //
    // userB: step-0 at T-3d (single attempt, succeeds), step-1 at T (3 days → TTC ≈ 3 days)
    //
    // Average TTC should be ~2.5 days, NOT ~6.5 days (which would result from using
    // the earliest step-0 for both).
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    const now = Date.now();
    const t = now;

    await insertTestEvents(ctx.ch, [
      // userA: two signups, one purchase
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'signup',
        timestamp: new Date(t - 10 * DAY_MS).toISOString(),
      }),
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
      // userB: single signup, one purchase
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'signup',
        timestamp: new Date(t - 3 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        timestamp: new Date(t).toISOString(),
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      from_step: 0,
      to_step: 1,
      conversion_window_days: 7,
      date_from: dateOffset(-15),
      date_to: dateOffset(1),
    });

    // Both users converted
    expect(result.sample_size).toBe(2);

    // Average TTC: (2 days + 3 days) / 2 = 2.5 days = 216000 seconds
    // Allow generous tolerance (±1 day) for test timing drift
    const expected = 2.5 * 86400;
    const avgSeconds = result.average_seconds ?? 0;
    expect(avgSeconds).toBeGreaterThan(1 * 86400);   // > 1 day
    expect(avgSeconds).toBeLessThan(5 * 86400);      // < 5 days (not the inflated ~6.5d)
  });
});
