import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import { countCohortMembers } from '../../cohorts/cohorts.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── Event conditions ────────────────────────────────────────────────────────

describe('countCohortMembers — event conditions', () => {
  it('counts persons who performed event >= N times', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId,
          person_id: personA,
          distinct_id: 'buyer-a',
          event_name: 'purchase',
          timestamp: msAgo(i * 1000),
        }),
      ),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'buyer-b',
        event_name: 'purchase',
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 2, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personA has >= 2
  });

  it('counts persons with exactly N events', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: msAgo(0) }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'login', count_operator: 'eq', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personB has exactly 1
  });
});

// ── Event aggregation math ──────────────────────────────────────────────────

describe('countCohortMembers — event aggregation math', () => {
  it('sum(revenue) >= threshold', async () => {
    const projectId = randomUUID();
    const bigSpender = randomUUID();
    const smallSpender = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: bigSpender,
        distinct_id: 'big',
        event_name: 'purchase',
        properties: JSON.stringify({ revenue: '500' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: bigSpender,
        distinct_id: 'big',
        event_name: 'purchase',
        properties: JSON.stringify({ revenue: '700' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: smallSpender,
        distinct_id: 'small',
        event_name: 'purchase',
        properties: JSON.stringify({ revenue: '50' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'purchase',
          count_operator: 'gte',
          count: 1000,
          time_window_days: 30,
          aggregation_type: 'sum',
          aggregation_property: 'properties.revenue',
        },
      ],
    });

    expect(count).toBe(1); // only bigSpender (500+700=1200 >= 1000)
  });

  it('avg(price) >= threshold', async () => {
    const projectId = randomUUID();
    const highAvg = randomUUID();
    const lowAvg = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: highAvg,
        distinct_id: 'high',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '100' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: highAvg,
        distinct_id: 'high',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '200' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowAvg,
        distinct_id: 'low',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '10' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowAvg,
        distinct_id: 'low',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '20' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'purchase',
          count_operator: 'gte',
          count: 50,
          time_window_days: 30,
          aggregation_type: 'avg',
          aggregation_property: 'properties.price',
        },
      ],
    });

    expect(count).toBe(1); // only highAvg (avg=150 >= 50)
  });

  it('max(score) <= threshold', async () => {
    const projectId = randomUUID();
    const lowScorer = randomUUID();
    const highScorer = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: lowScorer,
        distinct_id: 'low',
        event_name: 'game_round',
        properties: JSON.stringify({ score: '30' }),
        user_properties: JSON.stringify({ role: 'player' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowScorer,
        distinct_id: 'low',
        event_name: 'game_round',
        properties: JSON.stringify({ score: '45' }),
        user_properties: JSON.stringify({ role: 'player' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: highScorer,
        distinct_id: 'high',
        event_name: 'game_round',
        properties: JSON.stringify({ score: '80' }),
        user_properties: JSON.stringify({ role: 'player' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'game_round',
          count_operator: 'lte',
          count: 50,
          time_window_days: 30,
          aggregation_type: 'max',
          aggregation_property: 'properties.score',
        },
      ],
    });

    expect(count).toBe(1); // only lowScorer (max=45 <= 50)
  });

  it('backward compat: no aggregation_type defaults to count()', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId,
          person_id: personA,
          distinct_id: 'a',
          event_name: 'click',
          user_properties: JSON.stringify({ role: 'user' }),
          timestamp: msAgo(i * 1000),
        }),
      ),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'click',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'click', count_operator: 'gte', count: 2, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personA has >= 2
  });

  it('median(price) >= threshold', async () => {
    const projectId = randomUUID();
    const highMedian = randomUUID();
    const lowMedian = randomUUID();

    await insertTestEvents(ctx.ch, [
      // highMedian: prices [10, 100, 200] → median=100
      buildEvent({
        project_id: projectId,
        person_id: highMedian,
        distinct_id: 'high-med',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '10' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: highMedian,
        distinct_id: 'high-med',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '100' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: highMedian,
        distinct_id: 'high-med',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '200' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
      // lowMedian: prices [1, 2, 3] → median=2
      buildEvent({
        project_id: projectId,
        person_id: lowMedian,
        distinct_id: 'low-med',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '1' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowMedian,
        distinct_id: 'low-med',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '2' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowMedian,
        distinct_id: 'low-med',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '3' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'purchase',
          count_operator: 'gte',
          count: 50,
          time_window_days: 30,
          aggregation_type: 'median',
          aggregation_property: 'properties.price',
        },
      ],
    });

    expect(count).toBe(1); // only highMedian (median=100 >= 50)
  });

  it('p75(duration) <= threshold', async () => {
    const projectId = randomUUID();
    const fastUser = randomUUID();
    const slowUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      // fastUser: durations [10, 20, 30, 40] → p75=~32.5
      ...([10, 20, 30, 40] as const).map((d, i) =>
        buildEvent({
          project_id: projectId,
          person_id: fastUser,
          distinct_id: 'fast',
          event_name: 'page_load',
          properties: JSON.stringify({ duration: String(d) }),
          user_properties: JSON.stringify({ role: 'user' }),
          timestamp: msAgo((4 - i) * 1000),
        }),
      ),
      // slowUser: durations [100, 200, 300, 400] → p75=~325
      ...([100, 200, 300, 400] as const).map((d, i) =>
        buildEvent({
          project_id: projectId,
          person_id: slowUser,
          distinct_id: 'slow',
          event_name: 'page_load',
          properties: JSON.stringify({ duration: String(d) }),
          user_properties: JSON.stringify({ role: 'user' }),
          timestamp: msAgo((4 - i) * 1000),
        }),
      ),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'page_load',
          count_operator: 'lte',
          count: 50,
          time_window_days: 30,
          aggregation_type: 'p75',
          aggregation_property: 'properties.duration',
        },
      ],
    });

    expect(count).toBe(1); // only fastUser (p75≈32.5 <= 50)
  });
});
