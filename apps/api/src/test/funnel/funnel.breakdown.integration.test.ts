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

describe('queryFunnel — with breakdown', () => {
  it('segments funnel counts by a top-level property', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'chrome-user',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'chrome-user-2',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'firefox-user',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    expect(rBd.breakdown_property).toBe('browser');
    const chromeSteps = rBd.steps.filter((s) => s.breakdown_value === 'Chrome');
    const firefoxSteps = rBd.steps.filter((s) => s.breakdown_value === 'Firefox');
    expect(chromeSteps.find((s) => s.step === 1)?.count).toBe(2);
    expect(firefoxSteps.find((s) => s.step === 1)?.count).toBe(1);
    expect(rBd.aggregate_steps).toBeDefined();
    const aggStep1 = rBd.aggregate_steps.find((s) => s.step === 1);
    const aggStep2 = rBd.aggregate_steps.find((s) => s.step === 2);
    expect(aggStep1?.count).toBe(3);
    // drop_off for step 1 = users who entered step 1 but did not reach step 2
    // All 3 users signed up but none did 'checkout', so drop_off = 3 - 0 = 3
    expect(aggStep1?.drop_off).toBe(3);
    expect(aggStep1?.drop_off_rate).toBe(100);
    // step 2 is the last step — drop_off is 0
    expect(aggStep2?.drop_off).toBe(0);
  });
});

// ── P1: Funnel order types ──────────────────────────────────────────────────

describe('queryFunnel — aggregate_steps labels with property breakdown', () => {
  it('aggregate_steps carries correct label and event_name for each step even when some breakdown values have zero entrants at intermediate steps', async () => {
    const projectId = randomUUID();

    // Chrome: 3 users reach step 1 (page_view), 2 reach step 2 (signup), 0 reach step 3 (purchase)
    // Firefox: 2 users reach step 1 (page_view), 0 reach step 2 (signup), 0 reach step 3 (purchase)
    // The aggregate stepTotals will have entries for steps 1, 2, 3 (all with counts >= 0).
    // This test ensures aggregate_steps[i].label is driven by step NUMBER (sn - 1 index),
    // not by position idx in the sorted stepNums array.
    const chromeUser1 = randomUUID();
    const chromeUser2 = randomUUID();
    const chromeUser3 = randomUUID();
    const firefoxUser1 = randomUUID();
    const firefoxUser2 = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Chrome user 1: all 3 steps
      buildEvent({ project_id: projectId, person_id: chromeUser1, distinct_id: 'c1', event_name: 'page_view', browser: 'Chrome', timestamp: msAgo(9000) }),
      buildEvent({ project_id: projectId, person_id: chromeUser1, distinct_id: 'c1', event_name: 'signup', browser: 'Chrome', timestamp: msAgo(8000) }),
      buildEvent({ project_id: projectId, person_id: chromeUser1, distinct_id: 'c1', event_name: 'purchase', browser: 'Chrome', timestamp: msAgo(7000) }),
      // Chrome user 2: steps 1 + 2 only
      buildEvent({ project_id: projectId, person_id: chromeUser2, distinct_id: 'c2', event_name: 'page_view', browser: 'Chrome', timestamp: msAgo(6000) }),
      buildEvent({ project_id: projectId, person_id: chromeUser2, distinct_id: 'c2', event_name: 'signup', browser: 'Chrome', timestamp: msAgo(5000) }),
      // Chrome user 3: step 1 only
      buildEvent({ project_id: projectId, person_id: chromeUser3, distinct_id: 'c3', event_name: 'page_view', browser: 'Chrome', timestamp: msAgo(4000) }),
      // Firefox user 1: step 1 only
      buildEvent({ project_id: projectId, person_id: firefoxUser1, distinct_id: 'f1', event_name: 'page_view', browser: 'Firefox', timestamp: msAgo(3000) }),
      // Firefox user 2: step 1 only
      buildEvent({ project_id: projectId, person_id: firefoxUser2, distinct_id: 'f2', event_name: 'page_view', browser: 'Firefox', timestamp: msAgo(2000) }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'page_view', label: 'Page View' },
        { event_name: 'signup', label: 'Sign Up' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // Verify per-breakdown counts
    const chromeStep1 = rBd.steps.find((s) => s.breakdown_value === 'Chrome' && s.step === 1);
    const chromeStep2 = rBd.steps.find((s) => s.breakdown_value === 'Chrome' && s.step === 2);
    const chromeStep3 = rBd.steps.find((s) => s.breakdown_value === 'Chrome' && s.step === 3);
    expect(chromeStep1?.count).toBe(3);
    expect(chromeStep2?.count).toBe(2);
    expect(chromeStep3?.count).toBe(1);

    const firefoxStep1 = rBd.steps.find((s) => s.breakdown_value === 'Firefox' && s.step === 1);
    const firefoxStep2 = rBd.steps.find((s) => s.breakdown_value === 'Firefox' && s.step === 2);
    expect(firefoxStep1?.count).toBe(2);
    expect(firefoxStep2?.count).toBe(0);

    // Verify aggregate_steps labels are mapped by step NUMBER, not by position
    expect(rBd.aggregate_steps).toBeDefined();
    const aggStep1 = rBd.aggregate_steps.find((s) => s.step === 1);
    const aggStep2 = rBd.aggregate_steps.find((s) => s.step === 2);
    const aggStep3 = rBd.aggregate_steps.find((s) => s.step === 3);

    expect(aggStep1?.label).toBe('Page View');
    expect(aggStep1?.event_name).toBe('page_view');
    expect(aggStep1?.count).toBe(5); // 3 Chrome + 2 Firefox

    expect(aggStep2?.label).toBe('Sign Up');
    expect(aggStep2?.event_name).toBe('signup');
    expect(aggStep2?.count).toBe(2); // 2 Chrome + 0 Firefox

    expect(aggStep3?.label).toBe('Purchase');
    expect(aggStep3?.event_name).toBe('purchase');
    expect(aggStep3?.count).toBe(1); // 1 Chrome + 0 Firefox
  });
});

// ── P1: Funnel order types ──────────────────────────────────────────────────

describe('queryFunnel — strict order', () => {
  it('requires events in strict consecutive order (no interleaved events)', async () => {
    const projectId = randomUUID();
    const personOk = randomUUID();
    const personBad = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Person OK: signup → checkout (no other events between)
      buildEvent({
        project_id: projectId,
        person_id: personOk,
        distinct_id: 'ok',
        event_name: 'signup',
        timestamp: msAgo(30000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOk,
        distinct_id: 'ok',
        event_name: 'checkout',
        timestamp: msAgo(20000),
      }),
      // Person Bad: signup → page_view → checkout (interleaved event breaks strict)
      buildEvent({
        project_id: projectId,
        person_id: personBad,
        distinct_id: 'bad',
        event_name: 'signup',
        timestamp: msAgo(30000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBad,
        distinct_id: 'bad',
        event_name: 'page_view',
        timestamp: msAgo(25000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBad,
        distinct_id: 'bad',
        event_name: 'checkout',
        timestamp: msAgo(20000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const rStrict = result as Extract<typeof result, { breakdown: false }>;
    expect(rStrict.steps[0].count).toBe(2); // both entered
    expect(rStrict.steps[1].count).toBe(1); // only personOk completes strict
  });
});

describe('queryFunnel — unordered', () => {
  it('counts users who did all steps in any order', async () => {
    const projectId = randomUUID();
    const personForward = randomUUID();
    const personReverse = randomUUID();
    const personPartial = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Forward: A → B → C
      buildEvent({
        project_id: projectId,
        person_id: personForward,
        distinct_id: 'fwd',
        event_name: 'step_a',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personForward,
        distinct_id: 'fwd',
        event_name: 'step_b',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personForward,
        distinct_id: 'fwd',
        event_name: 'step_c',
        timestamp: msAgo(1000),
      }),
      // Reverse: C → B → A (should still count as all 3 steps done)
      buildEvent({
        project_id: projectId,
        person_id: personReverse,
        distinct_id: 'rev',
        event_name: 'step_c',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReverse,
        distinct_id: 'rev',
        event_name: 'step_b',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReverse,
        distinct_id: 'rev',
        event_name: 'step_a',
        timestamp: msAgo(1000),
      }),
      // Partial: A → B only (missing C)
      buildEvent({
        project_id: projectId,
        person_id: personPartial,
        distinct_id: 'partial',
        event_name: 'step_a',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPartial,
        distinct_id: 'partial',
        event_name: 'step_b',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
        { event_name: 'step_c', label: 'C' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    const rUnord = result as Extract<typeof result, { breakdown: false }>;
    expect(rUnord.steps[0].count).toBe(3); // all 3 entered
    expect(rUnord.steps[1].count).toBe(3); // all 3 did at least 2 unique steps
    expect(rUnord.steps[2].count).toBe(2); // forward + reverse did all 3
  });
});

describe('queryFunnel — property breakdown empty string vs null', () => {
  it('empty string breakdown_value maps to (none), not a separate group', async () => {
    // JSONExtractString returns '' both for missing properties and explicitly-empty ones.
    // Both should collapse to '(none)', while non-empty values remain distinct.
    const projectId = randomUUID();

    const userPremium = randomUUID();
    const userNoPlan = randomUUID();
    const userNoPlan2 = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Premium user: completes both steps
      buildEvent({
        project_id: projectId,
        person_id: userPremium,
        distinct_id: 'premium',
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userPremium,
        distinct_id: 'premium',
        event_name: 'checkout',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(4000),
      }),
      // User without plan (empty string from JSONExtractString): step 1 only
      buildEvent({
        project_id: projectId,
        person_id: userNoPlan,
        distinct_id: 'noplan',
        event_name: 'signup',
        properties: JSON.stringify({}),
        timestamp: msAgo(3000),
      }),
      // Another user without plan: step 1 only
      buildEvent({
        project_id: projectId,
        person_id: userNoPlan2,
        distinct_id: 'noplan2',
        event_name: 'signup',
        properties: JSON.stringify({}),
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'properties.plan',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // 'premium' group: 1 user entered step 1, 1 user reached step 2
    const premiumStep1 = rBd.steps.find((s) => s.breakdown_value === 'premium' && s.step === 1);
    const premiumStep2 = rBd.steps.find((s) => s.breakdown_value === 'premium' && s.step === 2);
    expect(premiumStep1?.count).toBe(1);
    expect(premiumStep2?.count).toBe(1);

    // '(none)' group: 2 users entered step 1, 0 reached step 2
    const noneStep1 = rBd.steps.find((s) => s.breakdown_value === '(none)' && s.step === 1);
    const noneStep2 = rBd.steps.find((s) => s.breakdown_value === '(none)' && s.step === 2);
    expect(noneStep1?.count).toBe(2);
    expect(noneStep2?.count).toBe(0);

    // No group with breakdown_value === '' should exist
    const emptyStringSteps = rBd.steps.filter((s) => s.breakdown_value === '');
    expect(emptyStringSteps).toHaveLength(0);
  });
});

describe('queryFunnel — aggregate_steps with sparse breakdown_property', () => {
  it('aggregate_steps[0].count equals total users even when breakdown_property is only filled for 60% of users', async () => {
    // Regression test for issue #487.
    // When breakdown_property is sparse, the SQL query for property breakdown rows
    // only includes users in top-N (by breakdown value). Previously, aggregate_steps
    // was computed by summing those top-N rows — underreporting total users by the
    // fraction with no breakdown value. The fix runs a separate no-breakdown aggregate
    // query so that ALL users are counted regardless of breakdown_property fill rate.
    const projectId = randomUUID();

    // 10 total users enter step 1 (signup).
    // 6 of them have browser set (will form top-N groups).
    // 4 of them have no browser (breakdown_value = '(none)').
    // With breakdown_limit: 2, the (none) group is still shown but
    // aggregate_steps[0].count must be 10, not 6 (old buggy behaviour).
    const usersWithBrowser = Array.from({ length: 6 }, () => ({ id: randomUUID(), browser: 'Chrome' }));
    const usersWithoutBrowser = Array.from({ length: 4 }, () => ({ id: randomUUID() }));

    const eventsToInsert = [
      ...usersWithBrowser.map((u, i) =>
        buildEvent({
          project_id: projectId,
          person_id: u.id,
          distinct_id: `wb-${i}`,
          event_name: 'signup',
          browser: u.browser,
          timestamp: msAgo(5000 + i * 100),
        }),
      ),
      ...usersWithoutBrowser.map((u, i) =>
        buildEvent({
          project_id: projectId,
          person_id: u.id,
          distinct_id: `wob-${i}`,
          event_name: 'signup',
          // No browser property — breakdown_value will be '' → '(none)'
          timestamp: msAgo(4000 + i * 100),
        }),
      ),
    ];

    await insertTestEvents(ctx.ch, eventsToInsert);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
      breakdown_limit: 1,
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // Steps should be limited to top-1 (Chrome) + (none)
    const breakdownValues = new Set(rBd.steps.map((s) => s.breakdown_value));
    expect(breakdownValues.has('Chrome')).toBe(true);
    expect(breakdownValues.has('(none)')).toBe(true);

    // aggregate_steps[0].count MUST be 10 (all users), not 6 (only Chrome users)
    const aggStep1 = rBd.aggregate_steps.find((s) => s.step === 1);
    expect(aggStep1?.count).toBe(10);
  });

  it('aggregate_steps matches no-breakdown query with unordered funnel and sparse property', async () => {
    const projectId = randomUUID();

    // 8 users: 5 with plan set (top-N), 3 without plan
    const usersWithPlan = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID(),
      plan: i < 3 ? 'pro' : 'starter',
    }));
    const usersWithoutPlan = Array.from({ length: 3 }, () => ({ id: randomUUID() }));

    const eventsToInsert = [
      ...usersWithPlan.flatMap((u, i) => [
        buildEvent({
          project_id: projectId,
          person_id: u.id,
          distinct_id: `wp-${i}`,
          event_name: 'step_a',
          properties: JSON.stringify({ plan: u.plan }),
          timestamp: msAgo(5000 + i * 100),
        }),
        buildEvent({
          project_id: projectId,
          person_id: u.id,
          distinct_id: `wp-${i}`,
          event_name: 'step_b',
          properties: JSON.stringify({ plan: u.plan }),
          timestamp: msAgo(4000 + i * 100),
        }),
      ]),
      ...usersWithoutPlan.flatMap((u, i) => [
        buildEvent({
          project_id: projectId,
          person_id: u.id,
          distinct_id: `wop-${i}`,
          event_name: 'step_a',
          timestamp: msAgo(3000 + i * 100),
        }),
        buildEvent({
          project_id: projectId,
          person_id: u.id,
          distinct_id: `wop-${i}`,
          event_name: 'step_b',
          timestamp: msAgo(2000 + i * 100),
        }),
      ]),
    ];

    await insertTestEvents(ctx.ch, eventsToInsert);

    const bdResult = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'properties.plan',
      breakdown_limit: 1,
      funnel_order_type: 'unordered',
    });

    const plainResult = await queryFunnel(ctx.ch, {
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

    expect(bdResult.breakdown).toBe(true);
    expect(plainResult.breakdown).toBe(false);

    const bdAgg = bdResult as Extract<typeof bdResult, { breakdown: true }>;
    const plain = plainResult as Extract<typeof plainResult, { breakdown: false }>;

    // aggregate_steps from breakdown query must match plain no-breakdown query
    expect(bdAgg.aggregate_steps[0]?.count).toBe(plain.steps[0]?.count); // 8
    expect(bdAgg.aggregate_steps[1]?.count).toBe(plain.steps[1]?.count); // 8
  });
});

describe('queryFunnel — breakdown groups ordered by popularity', () => {
  it('returns groups sorted by step-1 entered count descending', async () => {
    const projectId = randomUUID();

    // Three browser groups with different entered counts:
    //   Chrome:  5 users enter step 1
    //   Firefox: 3 users enter step 1
    //   Safari:  1 user  enters step 1
    // Expected order: Chrome, Firefox, Safari

    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        buildEvent({
          project_id: projectId, person_id: randomUUID(), distinct_id: `chrome-${i}`,
          event_name: 'signup', browser: 'Chrome', timestamp: msAgo(5000 + i * 100),
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId, person_id: randomUUID(), distinct_id: `firefox-${i}`,
          event_name: 'signup', browser: 'Firefox', timestamp: msAgo(4000 + i * 100),
        }),
      ),
      buildEvent({
        project_id: projectId, person_id: randomUUID(), distinct_id: 'safari-0',
        event_name: 'signup', browser: 'Safari', timestamp: msAgo(3000),
      }),
    ];

    await insertTestEvents(ctx.ch, events);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // Extract distinct breakdown_value in order of first appearance (step 1 rows come first per group).
    const step1Rows = rBd.steps.filter((s) => s.step === 1);
    const groupOrder = step1Rows.map((s) => s.breakdown_value);

    // Groups must be ordered by descending step-1 count.
    expect(groupOrder[0]).toBe('Chrome');   // 5 users
    expect(groupOrder[1]).toBe('Firefox');  // 3 users
    expect(groupOrder[2]).toBe('Safari');   // 1 user
  });
});

describe('queryFunnel — (none) does not displace real values from top-N', () => {
  it('excludes (none) from top-N ranking so real property values are not evicted', async () => {
    const projectId = randomUUID();

    // 5 real plan values + many users without any plan.
    // With breakdown_limit: 5, all 5 real values should appear even though (none) has more users.
    const plans = ['starter', 'pro', 'business', 'enterprise', 'ultimate'];
    const events: ReturnType<typeof buildEvent>[] = [];

    // 100 users without a plan (none) — high count to dominate if included in top-N
    for (let i = 0; i < 100; i++) {
      events.push(
        buildEvent({
          project_id: projectId, person_id: randomUUID(), distinct_id: `noplan-${i}`,
          event_name: 'signup', properties: JSON.stringify({}), timestamp: msAgo(8000 + i),
        }),
      );
    }

    // 2 users per real plan
    for (const plan of plans) {
      for (let i = 0; i < 2; i++) {
        events.push(
          buildEvent({
            project_id: projectId, person_id: randomUUID(), distinct_id: `${plan}-${i}`,
            event_name: 'signup', properties: JSON.stringify({ plan }), timestamp: msAgo(5000 + i * 100),
          }),
        );
      }
    }

    await insertTestEvents(ctx.ch, events);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'properties.plan',
      breakdown_limit: 5,
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const breakdownValues = new Set(rBd.steps.map((s) => s.breakdown_value));
    // All 5 real plan values must be present.
    for (const plan of plans) {
      expect(breakdownValues.has(plan)).toBe(true);
    }
    // (none) must also be present (shown as extra, outside top-N competition).
    expect(breakdownValues.has('(none)')).toBe(true);
    // Total groups = 5 real + 1 (none) = 6, not limited to 5.
    expect(breakdownValues.size).toBe(6);
    // breakdown_truncated is false because all 5 real values fit within the limit.
    expect(rBd.breakdown_truncated).toBe(false);

    // (none) must be last in the ordering.
    const step1Rows = rBd.steps.filter((s) => s.step === 1);
    expect(step1Rows[step1Rows.length - 1]!.breakdown_value).toBe('(none)');
  });
});
