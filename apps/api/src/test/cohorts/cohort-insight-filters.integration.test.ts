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
import { queryFunnel, type FunnelQueryResult } from '../../analytics/funnel/funnel.query';
import { queryTrend, type TrendQueryResult } from '../../analytics/trend/trend.query';
import type { CohortConditionGroup } from '@qurvo/db';
import { materializeCohort, insertStaticCohortMembers } from './helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── Funnel integration ──────────────────────────────────────────────────────

describe('cohort filter integration with funnel', () => {
  it('funnel with inline cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(1000) }),
    ]);

    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
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
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<FunnelQueryResult, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1); // only premium user
    expect(r.steps[1].count).toBe(1);
  });

  it('funnel with materialized cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(1000) }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      cohort_filters: [{ cohort_id: cohortId, definition, materialized: true, is_static: false }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<FunnelQueryResult, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

// ── Trend integration ───────────────────────────────────────────────────────

describe('cohort filter integration with trend', () => {
  it('trend with inline cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      cohort_filters: [{
        cohort_id: randomUUID(),
        definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }] },
        materialized: false,
        is_static: false,
      }],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    expect(r.series[0].data[0]?.value).toBe(1);
  });

  it('trend with materialized cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      cohort_filters: [{ cohort_id: cohortId, definition, materialized: true, is_static: false }],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    expect(r.series[0].data[0]?.value).toBe(1);
  });
});

// ── Funnel cohort breakdown ────────────────────────────────────────────────

describe('funnel cohort breakdown', () => {
  it('breakdown by inline (non-materialized) cohort returns correct counts', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(2000) }),
    ]);

    const premiumDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };
    const freeDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
    };

    const premiumCohortId = randomUUID();
    const freeCohortId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: premiumCohortId, name: 'Premium', is_static: false, materialized: false, definition: premiumDef },
        { cohort_id: freeCohortId, name: 'Free', is_static: false, materialized: false, definition: freeDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;
    const premiumStep1 = r.steps.find((s) => s.breakdown_value === premiumCohortId && s.step === 1);
    const freeStep1 = r.steps.find((s) => s.breakdown_value === freeCohortId && s.step === 1);
    expect(premiumStep1).toBeDefined();
    expect(freeStep1).toBeDefined();
    expect(premiumStep1!.count).toBe(1);
    expect(freeStep1!.count).toBe(1);
  });

  it('breakdown by materialized cohort returns correct counts', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    const premiumDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, premiumDef);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Premium', is_static: false, materialized: true, definition: premiumDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;
    const premiumStep1 = r.steps.find((s) => s.breakdown_value === cohortId && s.step === 1);
    expect(premiumStep1).toBeDefined();
    expect(premiumStep1!.count).toBe(1);
  });

  it('breakdown by static cohort returns correct counts', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(2000) }),
    ]);

    await insertStaticCohortMembers(ctx.ch, projectId, cohortId, [premiumUser]);

    const dummyDef: CohortConditionGroup = { type: 'AND', values: [] };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Static Premium', is_static: true, materialized: false, definition: dummyDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;
    const staticStep1 = r.steps.find((s) => s.breakdown_value === cohortId && s.step === 1);
    expect(staticStep1).toBeDefined();
    expect(staticStep1!.count).toBe(1);
  });
});

// ── Multiple cohort_filters AND semantics ─────────────────────────────────
// These tests verify that multiple cohort_filters entries are applied together
// (AND semantics): only users satisfying ALL filters are included.
// This is the behaviour produced by the factory's merge:
//   [...existing_cohort_filters, ...resolved_from_cohort_ids]

describe('multiple cohort_filters AND semantics (funnel)', () => {
  it('user matching both cohort filters is included', async () => {
    const projectId = randomUUID();
    // userA: plan=premium AND tier=gold  → satisfies both filters
    // userB: plan=premium AND tier=silver → satisfies only plan filter
    // userC: plan=free    AND tier=gold   → satisfies only tier filter
    // Note: 'tier' is not a top-level CH column — resolves via user_properties JSON.
    const userA = randomUUID();
    const userB = randomUUID();
    const userC = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium', tier: 'gold' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium', tier: 'gold' }), timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: userB, distinct_id: 'b', event_name: 'signup', user_properties: JSON.stringify({ plan: 'premium', tier: 'silver' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: userB, distinct_id: 'b', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'premium', tier: 'silver' }), timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: userC, distinct_id: 'c', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free', tier: 'gold' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: userC, distinct_id: 'c', event_name: 'checkout', user_properties: JSON.stringify({ plan: 'free', tier: 'gold' }), timestamp: msAgo(1000) }),
    ]);

    const premiumFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }] },
      materialized: false,
      is_static: false,
    };
    const goldFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' }] },
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
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      // Both filters applied simultaneously (AND semantics): only userA qualifies
      cohort_filters: [premiumFilter, goldFilter],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<FunnelQueryResult, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1); // only userA
    expect(r.steps[1].count).toBe(1);
  });

  it('no users matching all cohort filters yields empty steps', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    // user has plan=free — won't match the premium cohort filter
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: user, distinct_id: 'u', event_name: 'signup', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(2000) }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [{ event_name: 'signup', label: 'Signup' }],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      cohort_filters: [
        { cohort_id: randomUUID(), definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }] }, materialized: false, is_static: false },
      ],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<FunnelQueryResult, { breakdown: false }>;
    // When no users match, the funnel returns N zero-count steps (not an empty array)
    // so the frontend can still render the funnel structure
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].count).toBe(0);
    expect(r.steps[0].event_name).toBe('signup');
  });
});

describe('multiple cohort_filters AND semantics (trend)', () => {
  it('only user matching all cohort filters is counted', async () => {
    const projectId = randomUUID();
    // userA: plan=premium AND tier=gold   → in both cohorts → counted
    // userB: plan=premium AND tier=silver → in plan cohort only → excluded
    // userC: plan=free    AND tier=gold   → in tier cohort only → excluded
    // Note: 'tier' is not a top-level CH column — resolves via user_properties JSON.
    const userA = randomUUID();
    const userB = randomUUID();
    const userC = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium', tier: 'gold' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: userB, distinct_id: 'b', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium', tier: 'silver' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: userC, distinct_id: 'c', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free', tier: 'gold' }), timestamp: msAgo(3000) }),
    ]);

    const premiumFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }] },
      materialized: false,
      is_static: false,
    };
    const goldFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' }] },
      materialized: false,
      is_static: false,
    };

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      cohort_filters: [premiumFilter, goldFilter],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    // Only userA (premium + gold) matches both cohort filters
    expect(r.series[0].data[0]?.value).toBe(1);
  });
});

// ── Trend cohort breakdown ─────────────────────────────────────────────────

describe('trend cohort breakdown', () => {
  it('breakdown by inline (non-materialized) cohort returns correct counts', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    const premiumDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };
    const freeDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
    };

    const premiumCohortId = randomUUID();
    const freeCohortId = randomUUID();

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: premiumCohortId, name: 'Premium', is_static: false, materialized: false, definition: premiumDef },
        { cohort_id: freeCohortId, name: 'Free', is_static: false, materialized: false, definition: freeDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;
    const premiumSeries = r.series.find((s) => s.breakdown_value === premiumCohortId);
    const freeSeries = r.series.find((s) => s.breakdown_value === freeCohortId);
    expect(premiumSeries).toBeDefined();
    expect(freeSeries).toBeDefined();
    expect(premiumSeries!.breakdown_label).toBe('Premium');
    expect(freeSeries!.breakdown_label).toBe('Free');
    expect(premiumSeries!.data[0]?.value).toBe(1);
    expect(freeSeries!.data[0]?.value).toBe(1);
  });

  it('breakdown by materialized cohort returns correct counts', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    const premiumDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, premiumDef);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Premium', is_static: false, materialized: true, definition: premiumDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;
    const premiumSeries = r.series.find((s) => s.breakdown_value === cohortId);
    expect(premiumSeries).toBeDefined();
    expect(premiumSeries!.breakdown_label).toBe('Premium');
    expect(premiumSeries!.data[0]?.value).toBe(1);
  });

  it('breakdown by static cohort returns correct counts', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    await insertStaticCohortMembers(ctx.ch, projectId, cohortId, [premiumUser]);

    const dummyDef: CohortConditionGroup = { type: 'AND', values: [] };

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Static Premium', is_static: true, materialized: false, definition: dummyDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;
    const staticSeries = r.series.find((s) => s.breakdown_value === cohortId);
    expect(staticSeries).toBeDefined();
    expect(staticSeries!.breakdown_label).toBe('Static Premium');
    expect(staticSeries!.data[0]?.value).toBe(1);
  });
});

// ── Duplicate cohort name regression (issue #510) ───────────────────────────
// Two cohorts with identical names must produce distinct breakdown_value entries.

describe('cohort breakdown with duplicate names (issue #510 regression)', () => {
  it('funnel: two cohorts with the same name produce distinct breakdown_value entries', async () => {
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'signup', user_properties: JSON.stringify({ tier: 'gold' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: userB, distinct_id: 'b', event_name: 'signup', user_properties: JSON.stringify({ tier: 'silver' }), timestamp: msAgo(3000) }),
    ]);

    const goldDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' }],
    };
    const silverDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'silver' }],
    };

    const cohortId1 = randomUUID();
    const cohortId2 = randomUUID();

    // Both cohorts share the name "Duplicate Name"
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [{ event_name: 'signup', label: 'Signup' }],
      conversion_window_days: 7,
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: cohortId1, name: 'Duplicate Name', is_static: false, materialized: false, definition: goldDef },
        { cohort_id: cohortId2, name: 'Duplicate Name', is_static: false, materialized: false, definition: silverDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;

    // breakdown_value must be the cohort UUID, not the name — ensuring uniqueness
    const steps1 = r.steps.filter((s) => s.breakdown_value === cohortId1);
    const steps2 = r.steps.filter((s) => s.breakdown_value === cohortId2);
    expect(steps1).toHaveLength(1);
    expect(steps2).toHaveLength(1);

    // breakdown_label carries the human-readable name
    expect(steps1[0]?.breakdown_label).toBe('Duplicate Name');
    expect(steps2[0]?.breakdown_label).toBe('Duplicate Name');

    // Each cohort contains exactly 1 user
    expect(steps1[0]?.count).toBe(1);
    expect(steps2[0]?.count).toBe(1);
  });

  it('trend: two cohorts with the same name produce distinct breakdown_value entries', async () => {
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'click', user_properties: JSON.stringify({ tier: 'gold' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: userB, distinct_id: 'b', event_name: 'click', user_properties: JSON.stringify({ tier: 'silver' }), timestamp: msAgo(3000) }),
    ]);

    const goldDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' }],
    };
    const silverDef: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'silver' }],
    };

    const cohortId1 = randomUUID();
    const cohortId2 = randomUUID();

    // Both cohorts share the name "Duplicate Name"
    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      timezone: 'UTC',
      breakdown_cohort_ids: [
        { cohort_id: cohortId1, name: 'Duplicate Name', is_static: false, materialized: false, definition: goldDef },
        { cohort_id: cohortId2, name: 'Duplicate Name', is_static: false, materialized: false, definition: silverDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;

    // breakdown_value must be the cohort UUID, not the name — ensuring uniqueness
    const series1 = r.series.find((s) => s.breakdown_value === cohortId1);
    const series2 = r.series.find((s) => s.breakdown_value === cohortId2);
    expect(series1).toBeDefined();
    expect(series2).toBeDefined();

    // breakdown_label carries the human-readable name
    expect(series1!.breakdown_label).toBe('Duplicate Name');
    expect(series2!.breakdown_label).toBe('Duplicate Name');

    // Each cohort contains exactly 1 event
    expect(series1!.data[0]?.value).toBe(1);
    expect(series2!.data[0]?.value).toBe(1);
  });
});
