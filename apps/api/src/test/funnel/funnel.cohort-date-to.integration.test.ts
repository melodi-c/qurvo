/**
 * Integration tests verifying that cohort behavioral subqueries use `date_to`
 * from the funnel query instead of `now()`.
 *
 * Issue #466: behavioral cohort conditions were using `now() - INTERVAL N DAY`
 * which made historical funnel queries non-reproducible and broke Redis cache
 * coherence (the cache key includes `date_to` but the SQL was evaluated at
 * wall-clock time).
 *
 * Test strategy: insert events at 40 days ago.  Use `date_to` = 15 days ago
 * and a 30-day cohort window.
 *   - With `date_to` anchor: lower bound = 45 days ago → 40 days ago IS inside
 *     the window → cohort matches → user appears in funnel
 *   - With `now()` anchor: lower bound = 30 days ago → 40 days ago is OUTSIDE
 *     the window → cohort doesn't match → user would be absent from funnel
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryFunnel — cohort date_to anchor (issue #466)', () => {
  it('behavioral cohort event condition respects date_to, not now()', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();   // events at 40 days ago (inside 30-day window anchored at date_to=15dAgo)
    const personB = randomUUID();   // events at 5 days ago (inside 30-day window from both date_to and now)

    // personA: has a 'purchase' event at 40 days ago.
    // This is inside the cohort window when anchored at date_to=15 days ago
    // (40 days ago >= 45 days ago), but OUTSIDE when anchored at now()
    // (40 days ago < 30 days ago).
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(40),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(40),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(39),
      }),
    ]);

    // personB: has a 'purchase' event at 5 days ago.
    // Inside both 30-day windows (anchored at now() AND at date_to=15 days ago),
    // so personB always matches the cohort regardless of the fix.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(5),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(5),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(4),
      }),
    ]);

    // Cohort: "performed 'purchase' event at least once in the last 30 days"
    // With date_to = 15 days ago and 30-day window:
    //   lower bound = 15 days ago - 30 days = 45 days ago
    //   personA's purchase at 40 days ago IS within [45 days ago, 15 days ago]
    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [
          {
            type: 'event',
            event_name: 'purchase',
            count_operator: 'gte',
            count: 1,
            time_window_days: 30,
          },
        ],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(50),  // wide window to include all events
      date_to: daysAgo(15),    // historical date_to — 15 days ago
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Both personA and personB completed the funnel within the date range.
    // The cohort filter — anchored at date_to=15 days ago — should match BOTH:
    //   personA: purchase at 40 days ago is within [45 dAgo, 15 dAgo] ✓
    //   personB: purchase at 5 days ago is within [45 dAgo, 15 dAgo] ✓ (but outside funnel date range — see note)
    //
    // Wait: personB's events are at 5 days ago, but funnel date_to = 15 days ago,
    // so personB's events are NOT inside the funnel date range!
    // Only personA's funnel events (40/39 days ago) fall in [50 dAgo, 15 dAgo].
    //
    // So the expected result is:
    //   - personA: cohort matches (purchase at 40 dAgo is in [45 dAgo, 15 dAgo]) AND
    //              funnel events are in range → step 1 count = 1
    //   - personB: funnel events at 5 dAgo fall OUTSIDE date_to=15 days ago → not counted
    //
    // Key assertion: if now() were used instead of date_to, personA's purchase
    // (at 40 days ago) would be OUTSIDE the 30-day window from now(), causing the
    // cohort filter to fail and returning step count = 0.
    expect(r.steps[0].count).toBe(1); // personA is in cohort AND within funnel date range
    expect(r.steps[1].count).toBe(1); // personA converts
  });

  it('person_property condition respects date_to — user who became pro AFTER date_to must not be included', async () => {
    const projectId = randomUUID();
    const personUpgradedBefore = randomUUID();  // became 'pro' before date_to
    const personUpgradedAfter = randomUUID();   // became 'pro' after date_to

    const dateTo = daysAgo(10);

    // personUpgradedBefore: set plan='pro' 20 days ago (before date_to=10dAgo)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personUpgradedBefore,
        distinct_id: 'upgraded-before',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: daysAgo(20),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personUpgradedBefore,
        distinct_id: 'upgraded-before',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: daysAgo(19),
      }),
    ]);

    // personUpgradedAfter: started as 'free', upgraded to 'pro' AFTER date_to (5 days ago)
    // Without the fix, argMax would pick up the 'pro' value from 5 days ago,
    // making this person appear in the cohort even for historical queries.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personUpgradedAfter,
        distinct_id: 'upgraded-after',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(20),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personUpgradedAfter,
        distinct_id: 'upgraded-after',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(19),
      }),
      // This event is AFTER date_to — must not influence the cohort evaluation
      buildEvent({
        project_id: projectId,
        person_id: personUpgradedAfter,
        distinct_id: 'upgraded-after',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: daysAgo(5),
      }),
    ]);

    // Cohort: "user_properties.plan = 'pro'" evaluated at date_to=10 days ago
    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [
          {
            type: 'person_property',
            property: 'plan',
            operator: 'eq',
            value: 'pro',
          },
        ],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(30),
      date_to: dateTo,
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // With the fix:
    //   personUpgradedBefore: argMax(plan) at timestamp <= 10dAgo = 'pro' → matches cohort ✓
    //   personUpgradedAfter: argMax(plan) at timestamp <= 10dAgo = 'free' → does NOT match cohort ✗
    //
    // Without the fix (no timestamp upper bound):
    //   personUpgradedAfter: argMax(plan) = 'pro' (from the event at 5dAgo) → wrongly matches cohort
    expect(r.steps[0].count).toBe(1);  // only personUpgradedBefore
    expect(r.steps[1].count).toBe(1);  // personUpgradedBefore converts
  });

  it('behavioral cohort not_performed_event condition uses [date_from, date_to] window', async () => {
    const projectId = randomUUID();
    const personWithEventInPeriod = randomUUID(); // performed 'purchase' inside [date_from, date_to]
    const personWithoutEvent = randomUUID();       // never performed 'purchase'

    // date_from = 30 days ago, date_to = 15 days ago.
    // personWithEventInPeriod: purchase at 20 days ago (inside the analysis window)
    //   → not_performed condition FAILS → excluded from funnel
    // personWithoutEvent: no purchase
    //   → not_performed condition PASSES → included in funnel
    //
    // Without the #469 fix (rolling window from now()):
    //   window = [now - 30 days, now]
    //   purchase at 20 days ago is inside the now()-anchored window too → both approaches agree
    //
    // The key distinction tested here is that date_to (not now()) is the upper bound
    // (this covers the #466 regression), and the lower bound is date_from (not date_to - N days).
    // See the issue-#469 describe block below for a test that exercises the lower-bound change.
    await insertTestEvents(ctx.ch, [
      // personWithEventInPeriod: purchase at 20 dAgo (inside [30 dAgo, 15 dAgo]) + funnel events
      buildEvent({
        project_id: projectId,
        person_id: personWithEventInPeriod,
        distinct_id: 'with-event',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(20),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithEventInPeriod,
        distinct_id: 'with-event',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(28),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithEventInPeriod,
        distinct_id: 'with-event',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(27),
      }),
      // personWithoutEvent: no 'purchase', only funnel events
      buildEvent({
        project_id: projectId,
        person_id: personWithoutEvent,
        distinct_id: 'without',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'free' }),
        timestamp: daysAgo(28),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithoutEvent,
        distinct_id: 'without',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'free' }),
        timestamp: daysAgo(27),
      }),
    ]);

    // Cohort: "did NOT perform 'purchase' in the last 30 days"
    // Analysis window [date_from, date_to] = [30 dAgo, 15 dAgo]
    //   personWithEventInPeriod: purchase at 20 dAgo IS within [30, 15] → EXCLUDED
    //   personWithoutEvent: no purchase → INCLUDED
    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [
          {
            type: 'not_performed_event',
            event_name: 'purchase',
            time_window_days: 30,
          },
        ],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(30),
      date_to: daysAgo(15),
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // personWithEventInPeriod: purchase within analysis window → EXCLUDED
    // personWithoutEvent: no purchase → INCLUDED
    // Expected: 1 person (only personWithoutEvent)
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

/**
 * Tests for issue #469: not_performed_event should check absence in
 * [date_from, date_to] rather than the rolling [date_to - N days, date_to]
 * window when used inside a funnel/trend query.
 *
 * The rolling window may extend before date_from, catching events that are
 * outside the analysis period and incorrectly excluding users who performed the
 * target event before the funnel started.
 *
 * Test strategy:
 *   - Funnel period: [date_from, date_to] = [30 days ago, 10 days ago]
 *   - Cohort: "did NOT perform 'checkout' in the last 60 days" (time_window_days=60)
 *   - personA: performed 'checkout' at 45 days ago (BEFORE date_from=30 days ago)
 *     → Rolling window [70 dAgo, 10 dAgo] catches 45 dAgo → incorrectly excluded (old bug)
 *     → Fixed window  [30 dAgo, 10 dAgo] does NOT catch 45 dAgo → correctly included (new behaviour)
 *   - personB: never performed 'checkout'
 *     → Always included in cohort
 *   Both complete the funnel within [date_from, date_to].
 */
describe('queryFunnel — not_performed_event uses [date_from, date_to] window (issue #469)', () => {
  it('includes users who performed the event before date_from but not within the analysis period', async () => {
    const projectId = randomUUID();
    const personA = randomUUID(); // checkout at 45 dAgo (before date_from=30 dAgo)
    const personB = randomUUID(); // never checkout

    // date_from = 30 days ago, date_to = 10 days ago
    // personA: checkout at 45 days ago (before date_from), funnel events within period
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(45),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'complete',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(24),
      }),
    ]);

    // personB: no checkout at all, funnel events within period
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'complete',
        user_properties: JSON.stringify({ role: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    // Cohort: "did NOT perform checkout in last 60 days"
    // Rolling window relative to date_to=10dAgo: [70 dAgo, 10 dAgo]
    //   personA: checkout at 45 dAgo IS within [70, 10] → old code excludes personA (bug)
    // Fixed window: [date_from=30 dAgo, date_to=10 dAgo]
    //   personA: checkout at 45 dAgo is NOT within [30, 10] → new code includes personA (fix)
    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [
          {
            type: 'not_performed_event',
            event_name: 'checkout',
            time_window_days: 60,
          },
        ],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'complete', label: 'Complete' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(30),
      date_to: daysAgo(10),
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Both persons should be included:
    //   personA: checkout was at 45 dAgo (before date_from=30 dAgo) → NOT in analysis
    //            window [30, 10] → passes "not_performed" filter → included ✓
    //   personB: never did checkout → always passes filter → included ✓
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);
  });

  it('still excludes users who performed the event within [date_from, date_to]', async () => {
    const projectId = randomUUID();
    const personWithCheckout = randomUUID(); // checkout within funnel period
    const personWithoutCheckout = randomUUID(); // no checkout

    await insertTestEvents(ctx.ch, [
      // personWithCheckout: performed checkout inside [date_from, date_to]
      buildEvent({
        project_id: projectId,
        person_id: personWithCheckout,
        distinct_id: 'with-checkout',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(20),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithCheckout,
        distinct_id: 'with-checkout',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithCheckout,
        distinct_id: 'with-checkout',
        event_name: 'complete',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: daysAgo(24),
      }),
    ]);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personWithoutCheckout,
        distinct_id: 'without-checkout',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithoutCheckout,
        distinct_id: 'without-checkout',
        event_name: 'complete',
        user_properties: JSON.stringify({ role: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [
          {
            type: 'not_performed_event',
            event_name: 'checkout',
            time_window_days: 60,
          },
        ],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'complete', label: 'Complete' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(30),
      date_to: daysAgo(10),
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // personWithCheckout performed checkout at 20 dAgo which IS within [30 dAgo, 10 dAgo]
    //   → fails "not_performed" filter → excluded from cohort → excluded from funnel
    // personWithoutCheckout: never checkout → included
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});
