import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import { type CohortFilterInput } from '../../cohorts/cohorts.query';
import { queryFunnel, type FunnelQueryResult } from '../../funnel/funnel.query';
import { queryTrend, type TrendQueryResult } from '../../trend/trend.query';
import type { CohortConditionGroup } from '@qurvo/db';
import { materializeCohort, insertStaticCohortMembers } from './helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
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
      cohort_filters: [{
        cohort_id: randomUUID(),
        definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }] },
        materialized: false,
        is_static: false,
      }],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: false }>;
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
      cohort_filters: [{ cohort_id: cohortId, definition, materialized: true, is_static: false }],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: false }>;
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

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_cohort_ids: [
        { cohort_id: randomUUID(), name: 'Premium', is_static: false, materialized: false, definition: premiumDef },
        { cohort_id: randomUUID(), name: 'Free', is_static: false, materialized: false, definition: freeDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;
    const premiumStep1 = r.steps.find((s) => s.breakdown_value === 'Premium' && s.step === 1);
    const freeStep1 = r.steps.find((s) => s.breakdown_value === 'Free' && s.step === 1);
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
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Premium', is_static: false, materialized: true, definition: premiumDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;
    const premiumStep1 = r.steps.find((s) => s.breakdown_value === 'Premium' && s.step === 1);
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
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Static Premium', is_static: true, materialized: false, definition: dummyDef },
      ],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<FunnelQueryResult, { breakdown: true }>;
    const staticStep1 = r.steps.find((s) => s.breakdown_value === 'Static Premium' && s.step === 1);
    expect(staticStep1).toBeDefined();
    expect(staticStep1!.count).toBe(1);
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

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      breakdown_cohort_ids: [
        { cohort_id: randomUUID(), name: 'Premium', is_static: false, materialized: false, definition: premiumDef },
        { cohort_id: randomUUID(), name: 'Free', is_static: false, materialized: false, definition: freeDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;
    const premiumSeries = r.series.find((s) => s.breakdown_value === 'Premium');
    const freeSeries = r.series.find((s) => s.breakdown_value === 'Free');
    expect(premiumSeries).toBeDefined();
    expect(freeSeries).toBeDefined();
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
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Premium', is_static: false, materialized: true, definition: premiumDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;
    const premiumSeries = r.series.find((s) => s.breakdown_value === 'Premium');
    expect(premiumSeries).toBeDefined();
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
      breakdown_cohort_ids: [
        { cohort_id: cohortId, name: 'Static Premium', is_static: true, materialized: false, definition: dummyDef },
      ],
    });

    const r = result as Extract<TrendQueryResult, { compare: false; breakdown: true }>;
    const staticSeries = r.series.find((s) => s.breakdown_value === 'Static Premium');
    expect(staticSeries).toBeDefined();
    expect(staticSeries!.data[0]?.value).toBe(1);
  });
});
