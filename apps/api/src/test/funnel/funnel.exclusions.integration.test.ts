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

// ── P1: Exclusion steps ─────────────────────────────────────────────────────

describe('queryFunnel — per-window exclusion', () => {
  it('does not exclude a user who re-enters the funnel after an exclusion event', async () => {
    // Pattern: step1(T1) → exclusion(T2) → step1(T3) → step2(T4)
    // First window [T1, T4] is tainted by exclusion at T2.
    // But second window [T3, T4] is clean (exclusion at T2 is before T3).
    // User should NOT be excluded because a clean conversion path exists.
    const projectId = randomUUID();
    const personReentry = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Re-entry user: signup → cancel → signup (again) → purchase
      // Second signup starts a fresh window with no exclusion in it → should convert
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'signup',
        timestamp: msAgo(8000), // T1: first signup
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'cancel',
        timestamp: msAgo(6000), // T2: exclusion between T1 and final purchase
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'signup',
        timestamp: msAgo(4000), // T3: second signup — fresh window start after exclusion
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'purchase',
        timestamp: msAgo(2000), // T4: purchase — clean window [T3, T4] with no exclusion
      }),
      // Truly excluded: signup → cancel → purchase (no re-entry)
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'truly-excluded',
        event_name: 'signup',
        timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'truly-excluded',
        event_name: 'cancel',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'truly-excluded',
        event_name: 'purchase',
        timestamp: msAgo(2000),
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
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personExcluded: signup → cancel → purchase, all paths tainted → excluded from all steps
    // personReentry: signup → cancel → signup → purchase, second window (T3→T4) is clean → converts
    // The exclusion filter removes excluded users from all funnel step counts (including step 1)
    expect(r.steps[0].count).toBe(1); // only re-entry user (personExcluded is fully excluded)
    expect(r.steps[1].count).toBe(1); // re-entry user converts via second window
  });

  it('does not exclude a user whose exclusion event occurred outside the conversion window', async () => {
    // Pattern: exclusion at T0 (long before), step1 at T1, step2 at T2 (T2-T1 < window)
    // The exclusion at T0 is outside the [T1, T1+window] range → should NOT exclude
    const projectId = randomUUID();
    const personOldExcl = randomUUID();

    // Conversion window: 10 seconds
    const windowMs = 10_000;
    // step1 at 5s ago, step2 at 2s ago — within 10s window
    // exclusion at 30s ago — outside the 10s window starting from step1 at 5s ago
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personOldExcl,
        distinct_id: 'old-excl',
        event_name: 'cancel',
        timestamp: msAgo(30_000), // exclusion 30s ago — outside 10s window from step1
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOldExcl,
        distinct_id: 'old-excl',
        event_name: 'signup',
        timestamp: msAgo(5_000), // step1 at 5s ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOldExcl,
        distinct_id: 'old-excl',
        event_name: 'purchase',
        timestamp: msAgo(2_000), // step2 at 2s ago — 3s after step1, within 10s window
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 14,
      conversion_window_value: windowMs / 1000,
      conversion_window_unit: 'second',
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // User should convert — exclusion happened 30s before step1, not within the 10s window
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

describe('queryFunnel — exclusion steps', () => {
  it('excludes users who performed an exclusion event between funnel steps', async () => {
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Clean: signup → purchase (no cancel between)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Excluded: signup → cancel → purchase
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'cancel',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'purchase',
        timestamp: msAgo(1000),
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
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const rExcl = result as Extract<typeof result, { breakdown: false }>;
    expect(rExcl.steps[0].count).toBe(1); // only clean user
    expect(rExcl.steps[1].count).toBe(1);
  });
});

// ── P2: Exclusion with funnel_from_step > 0 ──────────────────────────────────

describe('queryFunnel — exclusion between non-zero steps', () => {
  it('excludes users who performed an exclusion event between steps 1 and 2 in a 3-step funnel', async () => {
    // 3-step funnel: signup → checkout → purchase
    // Exclusion: "cancel" between step 1 (checkout) and step 2 (purchase)
    //
    // personClean: signup → checkout → purchase (no cancel between checkout and purchase) → converts
    // personExcluded: signup → checkout → cancel → purchase (cancel between steps 1 and 2) → excluded
    // personEarlyCancel: signup → cancel → checkout → purchase (cancel before step 1, not between 1-2) → converts
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();
    const personEarlyCancel = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personClean: clean path through all 3 steps
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean-3step',
        event_name: 'signup',
        timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean-3step',
        event_name: 'checkout',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean-3step',
        event_name: 'purchase',
        timestamp: msAgo(3000),
      }),
      // personExcluded: cancel between checkout and purchase
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-3step',
        event_name: 'signup',
        timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-3step',
        event_name: 'checkout',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-3step',
        event_name: 'cancel',
        timestamp: msAgo(4000), // between checkout (6s ago) and purchase (2s ago)
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-3step',
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
      // personEarlyCancel: cancel between signup and checkout (not between steps 1-2)
      buildEvent({
        project_id: projectId,
        person_id: personEarlyCancel,
        distinct_id: 'early-cancel-3step',
        event_name: 'signup',
        timestamp: msAgo(10000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personEarlyCancel,
        distinct_id: 'early-cancel-3step',
        event_name: 'cancel',
        timestamp: msAgo(8000), // between signup and checkout — not scoped by from_step:1
      }),
      buildEvent({
        project_id: projectId,
        person_id: personEarlyCancel,
        distinct_id: 'early-cancel-3step',
        event_name: 'checkout',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personEarlyCancel,
        distinct_id: 'early-cancel-3step',
        event_name: 'purchase',
        timestamp: msAgo(2000),
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
      exclusions: [{ event_name: 'cancel', funnel_from_step: 1, funnel_to_step: 2 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personClean and personEarlyCancel enter and convert.
    // personExcluded is excluded (cancel between checkout and purchase).
    expect(r.steps[0].count).toBe(2); // personClean + personEarlyCancel (personExcluded removed from all steps)
    expect(r.steps[1].count).toBe(2); // both reach checkout
    expect(r.steps[2].count).toBe(2); // both reach purchase
  });
});

// ── P2: OR-logic steps in exclusion anchors ──────────────────────────────────

describe('queryFunnel — OR-logic steps as exclusion anchors', () => {
  it('blocks conversion of a user who entered via an alternative OR-event in the from-step anchor', async () => {
    // Scenario: from-step is OR(signup_click, signup_submit).
    // User A enters via signup_click (primary), does cancel (exclusion), then purchases.
    // User B enters via signup_submit (alternative OR-event), does cancel, then purchases.
    // Both should be excluded. Before the fix, User B was not excluded because
    // buildExclusionColumns only matched event_name = 'signup_click', missing 'signup_submit'.
    const projectId = randomUUID();
    const personA = randomUUID(); // enters via primary OR-event → should be excluded
    const personB = randomUUID(); // enters via alternative OR-event → should be excluded (was broken)
    const personClean = randomUUID(); // enters via primary, no exclusion → should convert

    await insertTestEvents(ctx.ch, [
      // Person A: signup_click → cancel → purchase (primary OR-event, should be excluded)
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'signup_click',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'cancel',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Person B: signup_submit → cancel → purchase (alternative OR-event, should be excluded)
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'signup_submit',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'cancel',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Person Clean: signup_click → purchase, no cancel (should convert)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup_click',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup_click',
          event_names: ['signup_click', 'signup_submit'],
          label: 'Any Signup',
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personA and personB are both excluded (all their paths are tainted by cancel).
    // Only personClean enters and converts → step counts are 1.
    expect(r.steps[0].count).toBe(1); // only clean user (personA + personB fully excluded)
    expect(r.steps[1].count).toBe(1); // clean user converts
  });

  it('blocks conversion of a user who entered via an alternative OR-event in the to-step anchor', async () => {
    // Scenario: to-step is OR(checkout, checkout_express).
    // The exclusion is anchored from step 0 → to-step (OR step).
    // User A completes to-step via checkout (primary) but has a cancel → excluded.
    // User B completes to-step via checkout_express (alternative) but has a cancel → excluded.
    // User Clean: step0 → checkout_express, no cancel → should convert.
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personClean = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Person A: view → cancel → checkout (excluded via primary to-step name)
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'page_view',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'cancel',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'checkout',
        timestamp: msAgo(2000),
      }),
      // Person B: view → cancel → checkout_express (excluded via alternative to-step name)
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'page_view',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'cancel',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'checkout_express',
        timestamp: msAgo(2000),
      }),
      // Person Clean: view → checkout_express, no cancel → should convert
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'page_view',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'checkout_express',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'page_view', label: 'Page View' },
        {
          event_name: 'checkout',
          event_names: ['checkout', 'checkout_express'],
          label: 'Any Checkout',
        },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personA and personB are both excluded. Only personClean converts.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('correctly handles exclusion when both from-step and to-step are OR-logic steps', async () => {
    // Both anchors are OR-logic steps. The exclusion event is between them.
    // User who enters via alternative OR-event on from-step AND exits via alternative
    // OR-event on to-step must still be correctly excluded.
    const projectId = randomUUID();
    const personExcluded = randomUUID(); // alt from + cancel + alt to → excluded
    const personClean = randomUUID();     // alt from + alt to, no cancel → converts

    await insertTestEvents(ctx.ch, [
      // Excluded: signup_submit → cancel → checkout_express (both alternate OR events)
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excl',
        event_name: 'signup_submit',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excl',
        event_name: 'cancel',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excl',
        event_name: 'checkout_express',
        timestamp: msAgo(2000),
      }),
      // Clean: signup_submit → checkout_express, no cancel
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup_submit',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'checkout_express',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup_click',
          event_names: ['signup_click', 'signup_submit'],
          label: 'Any Signup',
        },
        {
          event_name: 'checkout',
          event_names: ['checkout', 'checkout_express'],
          label: 'Any Checkout',
        },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personExcluded is fully excluded (cancel between OR from-step and OR to-step)
    // personClean converts
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

// ── P1: Granular conversion window ──────────────────────────────────────────

describe('queryFunnel — conversion window units', () => {
  it('uses minute-based conversion window', async () => {
    const projectId = randomUUID();
    const personFast = randomUUID();
    const personSlow = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Fast: step_a → step_b within 30 seconds
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_a',
        timestamp: msAgo(60_000), // 60 sec ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_b',
        timestamp: msAgo(30_000), // 30 sec ago
      }),
      // Slow: step_a → step_b with 3 minutes gap
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_a',
        timestamp: msAgo(300_000), // 5 min ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_b',
        timestamp: msAgo(120_000), // 2 min ago
      }),
    ]);

    // 1-minute window: only fast user converts
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 1, // fallback
      conversion_window_value: 1,
      conversion_window_unit: 'minute',
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const rWin = result as Extract<typeof result, { breakdown: false }>;
    expect(rWin.steps[0].count).toBe(2); // both entered
    expect(rWin.steps[1].count).toBe(1); // only fast within 1 min
  });
});

// ── Property-filter exclusion ────────────────────────────────────────────────

describe('queryFunnel — exclusion with property filters', () => {
  it('does not exclude users whose exclusion event does not match the exclusion property filter', async () => {
    // Scenario: step1=Signup, step2=ThankYou, exclusion=Purchase(plan=pro).
    // The exclusion filters by plan=pro. personBasic has Purchase(plan=basic)
    // which does NOT match the exclusion filter → should convert.
    // personPro has Purchase(plan=pro) which DOES match → should be excluded.
    const projectId = randomUUID();
    const personPro = randomUUID();
    const personBasic = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personPro: Signup → Purchase(plan=pro) → ThankYou
      // Purchase(plan=pro) matches the exclusion filter → personPro is excluded
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: 'pro',
        event_name: 'Signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: 'pro',
        event_name: 'Purchase',
        timestamp: msAgo(4000),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: 'pro',
        event_name: 'ThankYou',
        timestamp: msAgo(2000),
      }),
      // personBasic: Signup → Purchase(plan=basic) → ThankYou
      // Purchase(plan=basic) does NOT match the exclusion filter (plan=pro) → should convert
      buildEvent({
        project_id: projectId,
        person_id: personBasic,
        distinct_id: 'basic',
        event_name: 'Signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBasic,
        distinct_id: 'basic',
        event_name: 'Purchase',
        timestamp: msAgo(4000),
        properties: JSON.stringify({ plan: 'basic' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBasic,
        distinct_id: 'basic',
        event_name: 'ThankYou',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'Signup', label: 'Signup' },
        { event_name: 'ThankYou', label: 'Thank You' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [
        {
          event_name: 'Purchase',
          funnel_from_step: 0,
          funnel_to_step: 1,
          filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
        },
      ],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personPro is excluded (matched exclusion filter), personBasic is not (different plan)
    expect(r.steps[0].count).toBe(1); // only personBasic (personPro fully excluded)
    expect(r.steps[1].count).toBe(1); // personBasic converts
  });

  it('excludes a user whose exclusion event matches both name and property filter', async () => {
    // Exclusion: Refund(reason=fraud). personFraud has Refund(reason=fraud) → excluded.
    // personChargeback has Refund(reason=chargeback) → NOT matched by exclusion → converts.
    const projectId = randomUUID();
    const personFraud = randomUUID();
    const personChargeback = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personFraud: Purchase → Refund(reason=fraud) → ThankYou → excluded
      buildEvent({
        project_id: projectId,
        person_id: personFraud,
        distinct_id: 'fraud',
        event_name: 'Purchase',
        timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFraud,
        distinct_id: 'fraud',
        event_name: 'Refund',
        timestamp: msAgo(6000),
        properties: JSON.stringify({ reason: 'fraud' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFraud,
        distinct_id: 'fraud',
        event_name: 'ThankYou',
        timestamp: msAgo(4000),
      }),
      // personChargeback: Purchase → Refund(reason=chargeback) → ThankYou → converts
      buildEvent({
        project_id: projectId,
        person_id: personChargeback,
        distinct_id: 'chargeback',
        event_name: 'Purchase',
        timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personChargeback,
        distinct_id: 'chargeback',
        event_name: 'Refund',
        timestamp: msAgo(6000),
        properties: JSON.stringify({ reason: 'chargeback' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personChargeback,
        distinct_id: 'chargeback',
        event_name: 'ThankYou',
        timestamp: msAgo(4000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'Purchase', label: 'Purchase' },
        { event_name: 'ThankYou', label: 'Thank You' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [
        {
          event_name: 'Refund',
          funnel_from_step: 0,
          funnel_to_step: 1,
          filters: [{ property: 'properties.reason', operator: 'eq', value: 'fraud' }],
        },
      ],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personFraud is excluded (Refund reason=fraud), personChargeback converts (reason=chargeback)
    expect(r.steps[0].count).toBe(1); // only personChargeback
    expect(r.steps[1].count).toBe(1); // personChargeback converts
  });

  it('rejects an exclusion with the same event_name as a step and no property filters', async () => {
    // This configuration would cause false exclusions — the exclusion would match all
    // step events, excluding users who completed the step correctly.
    // validateExclusions should throw an AppBadRequestException.
    const projectId = randomUUID();
    await expect(() =>
      queryFunnel(ctx.ch, {
        project_id: projectId,
        steps: [
          { event_name: 'Purchase', label: 'Purchase' },
          { event_name: 'ThankYou', label: 'Thank You' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        exclusions: [
          {
            event_name: 'Purchase', // same as step 0
            funnel_from_step: 0,
            funnel_to_step: 1,
            // no filters → guaranteed false exclusion
          },
        ],
      }),
    ).rejects.toThrow('shares the same event name with a funnel step');
  });
});
