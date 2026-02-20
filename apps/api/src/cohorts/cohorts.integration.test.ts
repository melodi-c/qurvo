import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  type ContainerContext,
} from '@shot/testing';
import { countCohortMembers } from './cohorts.query';
import { queryFunnel } from '../funnel/funnel.query';
import { queryTrend } from '../trend/trend.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('countCohortMembers — person_property conditions', () => {
  it('counts persons matching eq condition on user_properties', async () => {
    const projectId = randomUUID();
    const now = new Date().toISOString();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'premium-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: now,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'free-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: now,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'all',
      conditions: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    });

    expect(count).toBe(1);
  });

  it('counts persons matching neq condition', async () => {
    const projectId = randomUUID();
    const now = new Date().toISOString();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: now,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-b',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: now,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-c',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: now,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'all',
      conditions: [
        { type: 'person_property', property: 'plan', operator: 'neq', value: 'premium' },
      ],
    });

    expect(count).toBe(2);
  });

  it('counts persons matching contains condition', async () => {
    const projectId = randomUUID();
    const now = new Date().toISOString();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-a',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Acme Corp' }),
        timestamp: now,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-b',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Beta Inc' }),
        timestamp: now,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'all',
      conditions: [
        { type: 'person_property', property: 'company', operator: 'contains', value: 'Acme' },
      ],
    });

    expect(count).toBe(1);
  });
});

describe('countCohortMembers — event conditions', () => {
  it('counts persons who performed event >= N times', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const now = new Date();

    const events = [
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId,
          person_id: personA,
          distinct_id: 'buyer-a',
          event_name: 'purchase',
          timestamp: new Date(now.getTime() - i * 1000).toISOString(),
        }),
      ),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'buyer-b',
        event_name: 'purchase',
        timestamp: now.toISOString(),
      }),
    ];

    await insertTestEvents(ctx.ch, events);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'all',
      conditions: [
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 2, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personA has >= 2
  });

  it('counts persons with exactly N events', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const now = new Date();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: new Date(now.getTime() - 2000).toISOString() }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: new Date(now.getTime() - 1000).toISOString() }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: now.toISOString() }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'all',
      conditions: [
        { type: 'event', event_name: 'login', count_operator: 'eq', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personB has exactly 1
  });
});

describe('countCohortMembers — combined conditions', () => {
  it('match=all: INTERSECT of conditions', async () => {
    const projectId = randomUUID();
    const personBoth = randomUUID();
    const personOnlyProp = randomUUID();
    const now = new Date();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personBoth,
        distinct_id: 'both',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: new Date(now.getTime() - 1000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOnlyProp,
        distinct_id: 'only-prop',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: now.toISOString(),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'all',
      conditions: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personBoth satisfies both
  });

  it('match=any: UNION of conditions', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const now = new Date();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: new Date(now.getTime() - 1000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: now.toISOString(),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      match: 'any',
      conditions: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(2); // both satisfy at least one condition
  });
});

describe('cohort filter integration with funnel', () => {
  it('funnel with cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const now = new Date();

    await insertTestEvents(ctx.ch, [
      // Both users do the funnel steps
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: new Date(now.getTime() - 2000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: new Date(now.getTime() - 1000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: new Date(now.getTime() - 2000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: new Date(now.getTime() - 1000).toISOString(),
      }),
    ]);

    // Funnel filtered to premium cohort only
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: new Date(now.getTime() - 86400_000).toISOString().slice(0, 10),
      date_to: new Date(now.getTime() + 86400_000).toISOString().slice(0, 10),
      cohort_filters: [{
        match: 'all',
        conditions: [
          { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        ],
      }],
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1); // only premium user
      expect(result.steps[1].count).toBe(1);
    }
  });
});

describe('cohort filter integration with trend', () => {
  it('trend with cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const now = new Date();
    const day = new Date(now.getTime() - 3000).toISOString();
    const dateStr = now.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: day,
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: day,
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateStr,
      date_to: dateStr,
      cohort_filters: [{
        match: 'all',
        conditions: [
          { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        ],
      }],
    });

    if (!result.compare && !result.breakdown) {
      expect(result.series[0].data[0]?.value).toBe(1);
    }
  });
});
