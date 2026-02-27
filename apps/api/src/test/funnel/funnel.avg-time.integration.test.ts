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

// ── avg_time_to_convert: strict mode re-entry heuristic ──────────────────────

describe('queryFunnel — avg_time_to_convert for strict mode re-entry (issue #474)', () => {
  it('strict mode: maxIf heuristic gives closer avg_time when step-0 is repeated before conversion', async () => {
    // Scenario for the maxIf heuristic:
    //   T=0s:  signup (step-0, early occurrence — no interruption follows)
    //   T=10s: signup (step-0 repeated, later occurrence)
    //   T=11s: purchase (step-1)
    //
    // windowFunnel('strict_order') matches the first signup → purchase sequence (max_step = 2).
    // The "true" starting point is ambiguous — the user could have started at T=0 or T=10.
    //
    // With minIf (old): first_step_ms = T=0s → avg_time = 11s
    // With maxIf (new heuristic): first_step_ms = T=10s → avg_time = 1s
    //
    // The maxIf heuristic is more useful when the later signup more closely represents
    // the actual intent (e.g. after a failed earlier attempt was followed by a reset-inducing
    // event, but then another attempt was made). See issue #474 for full context.
    //
    // Note: The "interrupted attempt" scenario (signup → random_event → signup → purchase)
    // does NOT convert in ClickHouse strict_order — windowFunnel returns max_step=1 in that case.
    // This test uses the simpler "repeated step-0" scenario which does convert.
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // Early signup — minIf would pick this one (old behavior)
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'reentry-user',
        event_name: 'signup',
        timestamp: new Date(now - 11_000).toISOString(),
      }),
      // Later signup — maxIf picks this one (new heuristic)
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'reentry-user',
        event_name: 'signup',
        timestamp: new Date(now - 1_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'reentry-user',
        event_name: 'purchase',
        timestamp: new Date(now - 500).toISOString(),
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
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0]!.count).toBe(1);
    expect(r.steps[1]!.count).toBe(1);

    // maxIf heuristic: first_step_ms = latest signup (~1s before now),
    // last_step_ms = purchase (~0.5s before now) → avg_time ≈ 0.5s.
    // minIf (old): first_step_ms = earliest signup (~11s before now) → avg_time ≈ 10.5s.
    // We verify the heuristic gives a significantly shorter result — under 5s.
    const avgTime = r.steps[0]!.avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(0);
    // maxIf heuristic: ~0.5s; minIf (old): ~10.5s
    expect(avgTime!).toBeLessThan(5);
  });

  it('strict mode without re-entry: avg_time is unaffected by maxIf vs minIf (single step-0 occurrence)', async () => {
    // When a user has only one signup (no re-entry), maxIf and minIf return the same value.
    // This ensures the heuristic change doesn't break the simple case.
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'single-entry',
        event_name: 'signup',
        timestamp: new Date(now - 5_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'single-entry',
        event_name: 'purchase',
        timestamp: new Date(now - 1_000).toISOString(),
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
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0]!.count).toBe(1);
    expect(r.steps[1]!.count).toBe(1);

    // signup → purchase: ~4s apart
    const avgTime = r.steps[0]!.avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeCloseTo(4, 0);

    expect(r.steps[1]!.avg_time_to_convert_seconds).toBeNull();
  });
});

// ── avg_time_to_convert: strict mode inversion fix (issue #507) ───────────────

describe('queryFunnel — strict mode avg_time_to_convert inversion fix (issue #507)', () => {
  it('strict mode: user with multiple attempts not dropped when early last-step predates latest step-0', async () => {
    // Counterexample from issue #507 — with the old maxIf/minIf approach:
    //   T=100ms: signup (step-0, failed attempt — no purchase follows within window)
    //   T=200ms: purchase (last-step, isolated old attempt — predates the successful step-0)
    //   T=300ms: signup (step-0, successful attempt)
    //   T=400ms: purchase (last-step, completes the successful attempt)
    //
    // Old (buggy): maxIf(step-0)=T300, minIf(last-step)=T200 → T300 > T200 → negative diff
    //   → user dropped from avg_time_to_convert
    //
    // Fixed (two-CTE): last_step_ms = minIf(last-step globally) = T200
    //   t0_arr = [T100, T300]
    //   filter: t0 <= T200 AND T200 ∈ [t0, t0+window] → only T100 qualifies
    //   first_step_ms = arrayMax([T100]) = T100 → diff = T200 - T100 = 100ms → positive → included
    //
    // NOTE: ClickHouse windowFunnel('strict_order') with events T100(signup),T200(purchase),
    // T300(signup),T400(purchase) returns max_step=2 — the user DID convert (signup→purchase
    // at T100→T200 without any intervening non-funnel events). The avg_time reflects that
    // first successful sequence (100ms).
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'inversion-user',
        event_name: 'signup',
        timestamp: new Date(now - 4_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'inversion-user',
        event_name: 'purchase',
        timestamp: new Date(now - 3_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'inversion-user',
        event_name: 'signup',
        timestamp: new Date(now - 2_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'inversion-user',
        event_name: 'purchase',
        timestamp: new Date(now - 1_000).toISOString(),
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
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // User converted — windowFunnel('strict_order') finds signup→purchase at T-4s→T-3s
    expect(r.steps[0]!.count).toBe(1);
    expect(r.steps[1]!.count).toBe(1);

    // avg_time must be non-null — old bug dropped this user (null avg) because
    // maxIf(step-0) > minIf(last-step) produced a negative difference
    const avgTime = r.steps[0]!.avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    // The earliest valid conversion window is signup@T-4s → purchase@T-3s = 1s
    expect(avgTime!).toBeGreaterThan(0);
    expect(avgTime!).toBeLessThan(5);

    expect(r.steps[1]!.avg_time_to_convert_seconds).toBeNull();
  });

  it('strict mode: user with multiple attempts counts in avg and is not dropped (two users)', async () => {
    // userA: inversion scenario — T-4s signup, T-3s purchase, T-2s signup, T-1s purchase
    //   windowFunnel converts at T-4s→T-3s, avg_time ≈ 1s
    // userB: simple single attempt — T-5s signup, T-1s purchase, avg_time ≈ 4s
    // Expected overall avg ≈ (1 + 4) / 2 = 2.5s
    //
    // With the old bug, userA was dropped → avg would be 4s (only userB counted)
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // userA: inversion scenario
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a-inversion',
        event_name: 'signup',
        timestamp: new Date(now - 4_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a-inversion',
        event_name: 'purchase',
        timestamp: new Date(now - 3_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a-inversion',
        event_name: 'signup',
        timestamp: new Date(now - 2_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a-inversion',
        event_name: 'purchase',
        timestamp: new Date(now - 1_000).toISOString(),
      }),
      // userB: single attempt
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b-simple',
        event_name: 'signup',
        timestamp: new Date(now - 5_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b-simple',
        event_name: 'purchase',
        timestamp: new Date(now - 1_000).toISOString(),
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
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps[0]!.count).toBe(2);
    expect(r.steps[1]!.count).toBe(2);

    // avg should reflect both users — roughly (1 + 4) / 2 = 2.5s
    // With the old bug, only userB counted → avg would be 4s
    const avgTime = r.steps[0]!.avg_time_to_convert_seconds;
    expect(avgTime).not.toBeNull();
    expect(avgTime!).toBeGreaterThan(1);
    expect(avgTime!).toBeLessThan(4);

    expect(r.steps[1]!.avg_time_to_convert_seconds).toBeNull();
  });
});
