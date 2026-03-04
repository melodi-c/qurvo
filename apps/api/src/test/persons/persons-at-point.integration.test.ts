import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryPersonsAtTrendBucket } from '../../persons/persons-at-trend-bucket.query';
import { queryPersonsAtStickinessBar } from '../../persons/persons-at-stickiness-bar.query';
import { truncateDate } from '../../analytics/query-helpers/time';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryPersonsAtTrendBucket', () => {
  it('returns persons that triggered event in a specific day bucket', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // personA: events on day-5 and day-3
    // personB: event on day-5 only
    // personC: event on day-3 only
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'page_view', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'page_view', timestamp: ts(3, 14) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'page_view', timestamp: ts(3, 16) }),
    ]);

    const bucketDate = truncateDate(daysAgo(5), 'day');

    const result = await queryPersonsAtTrendBucket(ctx.ch, {
      project_id: projectId,
      event_name: 'page_view',
      granularity: 'day',
      bucket: bucketDate,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    // Only personA and personB had events on day-5
    expect(result).toHaveLength(2);
    expect(result).toContain(personA);
    expect(result).toContain(personB);
    expect(result).not.toContain(personC);
  });

  it('returns empty for a bucket with no events', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(5, 12) }),
    ]);

    // Query for a day with no events
    const bucketDate = truncateDate(daysAgo(2), 'day');

    const result = await queryPersonsAtTrendBucket(ctx.ch, {
      project_id: projectId,
      event_name: 'click',
      granularity: 'day',
      bucket: bucketDate,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(0);
  });

  it('only returns persons for the specific event_name', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    const dayBucket = daysAgo(3);
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: ts(3, 14) }),
    ]);

    const bucketDate = truncateDate(dayBucket, 'day');

    const result = await queryPersonsAtTrendBucket(ctx.ch, {
      project_id: projectId,
      event_name: 'signup',
      granularity: 'day',
      bucket: bucketDate,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(1);
    expect(result).toContain(personA);
  });

  it('deduplicates persons with multiple events in the same bucket', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Same person fires 3 events on the same day
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 14) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 16) }),
    ]);

    const bucketDate = truncateDate(daysAgo(3), 'day');

    const result = await queryPersonsAtTrendBucket(ctx.ch, {
      project_id: projectId,
      event_name: 'click',
      granularity: 'day',
      bucket: bucketDate,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(person);
  });

  it('supports week granularity', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Events spread across different weeks
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'visit', timestamp: ts(14, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'visit', timestamp: ts(3, 12) }),
    ]);

    const weekBucket = truncateDate(daysAgo(14), 'week');

    const result = await queryPersonsAtTrendBucket(ctx.ch, {
      project_id: projectId,
      event_name: 'visit',
      granularity: 'week',
      bucket: weekBucket,
      date_from: daysAgo(21),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toContain(personA);
    // personB should NOT be in the same week bucket as personA
    // (unless they happen to fall in the same week, which is unlikely with 11 days apart)
  });
});

describe('queryPersonsAtStickinessBar', () => {
  it('returns persons with exactly N active days', async () => {
    const projectId = randomUUID();
    const personA = randomUUID(); // active 3 days
    const personB = randomUUID(); // active 1 day
    const personC = randomUUID(); // active 5 days

    await insertTestEvents(ctx.ch, [
      // personA: 3 days
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(3, 12) }),
      // personB: 1 day
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: ts(5, 10) }),
      // personC: 5 days
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(2, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(1, 12) }),
    ]);

    // period_count=3 should return only personA
    const result = await queryPersonsAtStickinessBar(ctx.ch, {
      project_id: projectId,
      event_name: 'login',
      granularity: 'day',
      period_count: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(personA);
  });

  it('returns multiple persons with the same active period count', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Both active exactly 2 days
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'click', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'click', timestamp: ts(2, 12) }),
    ]);

    const result = await queryPersonsAtStickinessBar(ctx.ch, {
      project_id: projectId,
      event_name: 'click',
      granularity: 'day',
      period_count: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(2);
    expect(result).toContain(personA);
    expect(result).toContain(personB);
  });

  it('returns empty when no person matches the period count', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Person active 2 days
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'view', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'view', timestamp: ts(3, 12) }),
    ]);

    // Ask for period_count=4 — nobody matches
    const result = await queryPersonsAtStickinessBar(ctx.ch, {
      project_id: projectId,
      event_name: 'view',
      granularity: 'day',
      period_count: 4,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(0);
  });

  it('counts multiple events on the same day as one active period', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // 3 events on the same day + 1 event on another day = 2 active days
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(5, 14) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(5, 18) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 12) }),
    ]);

    const result = await queryPersonsAtStickinessBar(ctx.ch, {
      project_id: projectId,
      event_name: 'click',
      granularity: 'day',
      period_count: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(person);
  });

  it('isolates by project_id', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const person = randomUUID();

    // Same person in two different projects
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectA, person_id: person, distinct_id: 'a', event_name: 'event', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectA, person_id: person, distinct_id: 'a', event_name: 'event', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectB, person_id: person, distinct_id: 'a', event_name: 'event', timestamp: ts(5, 12) }),
    ]);

    // projectA: 2 active days
    const resultA = await queryPersonsAtStickinessBar(ctx.ch, {
      project_id: projectA,
      event_name: 'event',
      granularity: 'day',
      period_count: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });
    expect(resultA).toHaveLength(1);

    // projectB: 1 active day — period_count=2 should return empty
    const resultB = await queryPersonsAtStickinessBar(ctx.ch, {
      project_id: projectB,
      event_name: 'event',
      granularity: 'day',
      period_count: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });
    expect(resultB).toHaveLength(0);
  });
});
