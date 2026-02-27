import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── avg_time_to_convert: unordered funnel ────────────────────────────────────

describe('queryFunnel — avg_time_to_convert for unordered funnel', () => {
  it('returns total conversion time (earliest to latest step) for unordered funnel', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // personA: step_b first, then step_a — reversed order, 10s apart
    // conversion time = 10s (from anchor=t_b to latest=t_a)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'step_b',
        timestamp: msAgo(20_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'step_a',
        timestamp: msAgo(10_000),
      }),
      // personB: step_a first, then step_b — 30s apart
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'step_a',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'step_b',
        timestamp: msAgo(30_000),
      }),
      // personC: only step_a, no step_b — does not complete funnel
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'step_a',
        timestamp: msAgo(5_000),
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
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].count).toBe(3); // all 3 entered step A
    expect(r.steps[1].count).toBe(2); // A and B completed both steps

    // Step 1 (penultimate) shows avg conversion time for users who completed both steps.
    // personA: 10s, personB: 30s → avg = 20s
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(0);
    expect(avgTime!).toBeCloseTo(20, 0);

    // Last step always returns null
    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('returns null avg_time for unordered funnel when no one completes all steps', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'alone',
        event_name: 'step_a',
        timestamp: msAgo(5_000),
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
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // No one converted — avg_time_seconds averages over an empty set → 0 in ClickHouse,
    // which is treated as null by computeStepResults (the condition last_step_ms > first_step_ms
    // filters out non-converters, so the avg is NaN/0).
    expect(r.steps[0].avg_time_to_convert_seconds).toBeNull();
  });
});

// ── avg_time_to_convert: OR-logic steps ─────────────────────────────────────

describe('queryFunnel — avg_time_to_convert for OR-logic steps (ordered funnel)', () => {
  it('uses correct first_step_ms when user triggers OR-event that is not the primary event_name', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: triggers click_signup (the primary event_name) → purchase, 20s apart
    // personB: triggers submit_signup (the alternate OR-event) → purchase, 40s apart
    // Both should have valid first_step_ms, giving avg = 30s
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'click_signup',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(40_000),
      }),
      // personB uses the second OR-event (submit_signup)
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'submit_signup',
        timestamp: msAgo(80_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(40_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'click_signup',
          event_names: ['click_signup', 'submit_signup'],
          label: 'Any Signup',
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);

    // Both users completed the funnel.
    // personA: 20s, personB: 40s → avg = 30s.
    // Before the fix, personB's first_step_ms was 0 (submit_signup != click_signup),
    // so the avgIf condition (last_step_ms > first_step_ms) would incorrectly include
    // personB with first_step_ms=0, giving a wrong inflated conversion time.
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(0);
    expect(avgTime!).toBeCloseTo(30, 0);

    // Last step always returns null
    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });

  it('returns null avg_time when only OR-alternate event matches and primary name is wrong (single step)', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Only submit_signup fires (not click_signup which is primary event_name)
    // No purchase event — should not convert
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user',
        event_name: 'submit_signup',
        timestamp: msAgo(5_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'click_signup',
          event_names: ['click_signup', 'submit_signup'],
          label: 'Any Signup',
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1); // entered via submit_signup
    expect(r.steps[1].count).toBe(0); // no purchase
    expect(r.steps[0].avg_time_to_convert_seconds).toBeNull(); // no completions
  });

  it('avg_time_to_convert works correctly for 3-step funnel with OR-logic on middle step', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Both complete: signup → (add_cart OR add_wishlist) → purchase
    // personA uses add_cart, personB uses add_wishlist
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'signup',
        timestamp: msAgo(90_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'add_cart',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(30_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'signup',
        timestamp: msAgo(120_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'add_wishlist',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(30_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        {
          event_name: 'add_cart',
          event_names: ['add_cart', 'add_wishlist'],
          label: 'Add to Cart/Wishlist',
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);
    expect(r.steps[2].count).toBe(2);

    // avg total time: personA = 60s (90000-30000ms), personB = 90s (120000-30000ms) → avg = 75s
    const step1Avg = r.steps[0].avg_time_to_convert_seconds;
    const step2Avg = r.steps[1].avg_time_to_convert_seconds;
    expect(step1Avg).not.toBeNull();
    expect(step2Avg).not.toBeNull();
    // Both should be the same (total conversion time)
    expect(step1Avg).toBeCloseTo(step2Avg!, 0);
    expect(step1Avg!).toBeGreaterThan(0);

    // Last step always null
    expect(r.steps[2].avg_time_to_convert_seconds).toBeNull();
  });
});

// ── avg_time_to_convert: repeated last-step events ───────────────────────────

describe('queryFunnel — avg_time_to_convert with repeated last-step events', () => {
  it('uses first occurrence of last step, not latest, so repeated purchases do not inflate avg_time', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: signup@T0(-90s), checkout@T1(-60s), purchase@T2(-30s), purchase@T3(-5s)
    //   windowFunnel sees conversion T0→T1→T2
    //   correct conversion time = 60s (T0 to T2)
    //   with maxIf bug: last_step_ms = T3 → inflated to ~85s
    // personB: signup@T0(-60s), checkout@T1(-40s), purchase@T2(-20s) (no repeat)
    //   correct conversion time = 40s
    // Expected avg: (60 + 40) / 2 = 50s
    await insertTestEvents(ctx.ch, [
      // personA
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'signup',
        timestamp: msAgo(90_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'checkout',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(30_000),
      }),
      // personA repeats the last step an hour later — must not affect avg_time
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(5_000),
      }),
      // personB (no repeat)
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'signup',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'checkout',
        timestamp: msAgo(40_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(20_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);
    expect(r.steps[2].count).toBe(2);

    // avg conversion time should be 50s (personA=60s, personB=40s).
    // If maxIf bug were present, personA would show ~85s → avg ~62.5s.
    const step1Avg = r.steps[0].avg_time_to_convert_seconds;
    expect(step1Avg).not.toBeNull();
    expect(step1Avg!).toBeCloseTo(50, 0);

    // Also check step 2 (penultimate before last) — same total conversion time
    const step2Avg = r.steps[1].avg_time_to_convert_seconds;
    expect(step2Avg).not.toBeNull();
    expect(step2Avg!).toBeCloseTo(50, 0);

    // Last step always returns null
    expect(r.steps[2].avg_time_to_convert_seconds).toBeNull();
  });

  it('avg_time is not affected by a repeated first-step event (minIf still picks earliest)', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Person fires signup twice, then purchase once.
    // First signup at -60s, repeated signup at -30s, purchase at -10s.
    // Correct conversion time = 50s (first signup to purchase).
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u',
        event_name: 'signup',
        timestamp: msAgo(60_000),
      }),
      // Repeated first step — minIf should still pick the earlier one
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u',
        event_name: 'signup',
        timestamp: msAgo(30_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u',
        event_name: 'purchase',
        timestamp: msAgo(10_000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);

    // Conversion time = 50s (earliest signup to first purchase)
    const avgTime = r.steps[0].avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeCloseTo(50, 0);

    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });
});
