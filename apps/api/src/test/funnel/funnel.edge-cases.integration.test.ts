import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── 1-step funnel (degenerate case) ──────────────────────────────────────────

describe('queryFunnel — 1-step funnel (degenerate case)', () => {
  it('returns 100% conversion rate for all users who performed the single event', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'signup',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [{ event_name: 'signup', label: 'Signed up' }],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // 1-step funnel: only one step exists — all entrants = 100% conversion
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[0].conversion_rate).toBe(100);
    // There is no "next step", so drop_off = entered - 0 = 2 (last step always drops off nobody)
    // The last step semantics: drop_off = entered - converted, converted = 0 for last step
    expect(r.steps[0].drop_off).toBe(2);
    // avg_time is always null for the last step
    expect(r.steps[0].avg_time_to_convert_seconds).toBeNull();
  });

  it('returns empty steps for 1-step funnel when no events match', async () => {
    // When no events exist in the queried project/date range, funnel_per_user has 0 rows.
    // The CROSS JOIN with numbers(N) yields 0 output rows, so steps is an empty array.
    const projectId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [{ event_name: 'never_happened', label: 'Never' }],
      conversion_window_days: 7,
      date_from: dateOffset(-5),
      date_to: dateOffset(-3),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // No events → funnel_per_user is empty → CROSS JOIN yields 0 rows → steps is []
    expect(r.steps).toHaveLength(0);
  });

  it('1-step funnel with a step filter restricts to matching events only', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: click with button=buy — matches step filter
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'click',
        properties: JSON.stringify({ button: 'buy' }),
        timestamp: msAgo(2000),
      }),
      // personB: click with button=cancel — does NOT match step filter
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'click',
        properties: JSON.stringify({ button: 'cancel' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'click',
          label: 'Buy Click',
          filters: [{ property: 'properties.button', operator: 'eq', value: 'buy' }],
        },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].count).toBe(1); // only personA matches
    expect(r.steps[0].conversion_rate).toBe(100);
  });
});

// ── OR-logic steps + exclusions combined ──────────────────────────────────────

describe('queryFunnel — OR-logic steps combined with exclusions', () => {
  it('exclusion correctly filters users who entered via OR-step variant and encountered exclusion event', async () => {
    // Scenario:
    // from-step: OR(signup_click, signup_submit)
    // to-step: purchase
    // exclusion: cancel between from-step and to-step
    //
    // personA: signup_click → cancel → purchase (enters via primary, excluded)
    // personB: signup_submit → cancel → purchase (enters via OR-variant, also excluded)
    // personClean: signup_click → purchase (no cancel, should convert)
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personClean = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: primary OR-event → cancel → purchase
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'signup_click',
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
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
      // personB: alternative OR-event → cancel → purchase
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'signup_submit',
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
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
      // personClean: primary OR-event → purchase (no cancel, converts cleanly)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup_click',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'purchase',
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
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personA and personB are excluded (cancel tainted all their paths)
    // only personClean enters and converts
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('exclusion between two OR-logic steps correctly blocks users via both OR variants on to-step', async () => {
    // from-step: page_view
    // to-step: OR(checkout, checkout_express)
    // exclusion: cancel between from and to
    //
    // personA: page_view → cancel → checkout (primary to-step, excluded)
    // personB: page_view → cancel → checkout_express (alt to-step, also excluded)
    // personClean: page_view → checkout_express (no cancel, converts)
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personClean = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: view → cancel → checkout (primary variant)
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
      // personB: view → cancel → checkout_express (alternative variant)
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
      // personClean: view → checkout_express (no cancel)
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
    // personA and personB are excluded; only personClean remains
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('user without exclusion event converts even when all funnel steps are OR-logic steps', async () => {
    // Both from and to steps are OR-logic; person who completes them without cancel converts
    const projectId = randomUUID();
    const personConverts = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personConverts: signup_submit → checkout_express (no cancel) — should convert
      buildEvent({
        project_id: projectId,
        person_id: personConverts,
        distinct_id: 'converts',
        event_name: 'signup_submit',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personConverts,
        distinct_id: 'converts',
        event_name: 'checkout_express',
        timestamp: msAgo(2000),
      }),
      // personExcluded: signup_click → cancel → checkout_express — should be excluded
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'signup_click',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'cancel',
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
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
    // personExcluded is excluded; only personConverts remains and converts
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

// ── Cohort breakdown + exclusions ─────────────────────────────────────────────

describe('queryFunnel — cohort breakdown with exclusions', () => {
  it('applies exclusions per cohort in a cohort-breakdown funnel', async () => {
    // Two cohorts: premium and free users.
    // All 4 users complete signup → purchase.
    // 1 premium user and 1 free user also have a 'cancel' event between steps.
    // Exclusion: cancel between step 0 → 1.
    //
    // Expected: only non-cancelled users count per cohort.
    const projectId = randomUUID();
    const premiumClean = randomUUID();
    const premiumExcluded = randomUUID();
    const freeClean = randomUUID();
    const freeExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // premiumClean: signup → purchase (no cancel) — premium cohort
      buildEvent({
        project_id: projectId,
        person_id: premiumClean,
        distinct_id: 'premium-clean',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumClean,
        distinct_id: 'premium-clean',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      // premiumExcluded: signup → cancel → purchase — premium cohort
      buildEvent({
        project_id: projectId,
        person_id: premiumExcluded,
        distinct_id: 'premium-excl',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumExcluded,
        distinct_id: 'premium-excl',
        event_name: 'cancel',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumExcluded,
        distinct_id: 'premium-excl',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      // freeClean: signup → purchase (no cancel) — free cohort
      buildEvent({
        project_id: projectId,
        person_id: freeClean,
        distinct_id: 'free-clean',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeClean,
        distinct_id: 'free-clean',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(2000),
      }),
      // freeExcluded: signup → cancel → purchase — free cohort
      buildEvent({
        project_id: projectId,
        person_id: freeExcluded,
        distinct_id: 'free-excl',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeExcluded,
        distinct_id: 'free-excl',
        event_name: 'cancel',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeExcluded,
        distinct_id: 'free-excl',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(2000),
      }),
    ]);

    const premiumCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Premium',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    };

    const freeCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Free',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_cohort_ids: [premiumCohort, freeCohort],
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    const premiumSteps = r.steps.filter((s) => s.breakdown_value === 'Premium');
    const freeSteps = r.steps.filter((s) => s.breakdown_value === 'Free');

    // Premium cohort: 2 users entered, 1 excluded → 1 remains in step 1, 1 converts
    expect(premiumSteps.find((s) => s.step === 1)?.count).toBe(1);
    expect(premiumSteps.find((s) => s.step === 2)?.count).toBe(1);

    // Free cohort: 2 users entered, 1 excluded → 1 remains in step 1, 1 converts
    expect(freeSteps.find((s) => s.step === 1)?.count).toBe(1);
    expect(freeSteps.find((s) => s.step === 2)?.count).toBe(1);

    // avg_time_to_convert_seconds must be null for all breakdown steps (breakdown disables it)
    for (const step of r.steps) {
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }
  });
});

// ── avg_time_to_convert_seconds = null in all breakdown modes ─────────────────

describe('queryFunnel — avg_time_to_convert_seconds always null in breakdown queries', () => {
  it('is null for all steps in a property breakdown funnel', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA (Chrome): completes full funnel quickly
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'chrome',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'chrome',
        event_name: 'purchase',
        browser: 'Chrome',
        timestamp: msAgo(1000),
      }),
      // personB (Firefox): completes full funnel
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'firefox',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'firefox',
        event_name: 'purchase',
        browser: 'Firefox',
        timestamp: msAgo(1500),
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
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    // For property breakdown: includeTimestampCols = false → avg_time_seconds column absent
    // so avg_time_to_convert_seconds must be null for every step in every breakdown group
    for (const step of r.steps) {
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }

    // aggregate_steps also use computeAggregateSteps which always sets null
    for (const step of r.aggregate_steps) {
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }
  });

  it('is null for all steps in a cohort breakdown funnel', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      // premiumUser: signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      // freeUser: signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(500),
      }),
    ]);

    const premiumCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Premium',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    };

    const freeCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Free',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_cohort_ids: [premiumCohort, freeCohort],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    // cohort breakdown uses a separate SQL without avg_time columns
    // avg_time_to_convert_seconds must be null for every step in every cohort breakdown
    for (const step of r.steps) {
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }

    // aggregate_steps (computed by computeAggregateSteps) also always null
    for (const step of r.aggregate_steps) {
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }
  });

  it('non-breakdown funnel has avg_time populated (not null) for non-last steps when users convert', async () => {
    // This serves as a control: shows avg_time IS computed for non-breakdown funnels,
    // confirming the null values in breakdown tests above are due to the intended design.
    const projectId = randomUUID();
    const person = randomUUID();

    // person completes signup → purchase with ~2 second gap
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user',
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
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // step 1 (non-last): avg_time should be a non-null number (seconds between signup and purchase)
    expect(r.steps[0].avg_time_to_convert_seconds).not.toBeNull();
    expect(r.steps[0].avg_time_to_convert_seconds).toBeGreaterThan(0);

    // step 2 (last step): avg_time is always null regardless
    expect(r.steps[1].avg_time_to_convert_seconds).toBeNull();
  });
});
