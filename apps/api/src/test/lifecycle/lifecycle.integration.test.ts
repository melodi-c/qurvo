import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { queryLifecycle } from '../../analytics/lifecycle/lifecycle.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryLifecycle — basic classification', () => {
  it('classifies new, returning, and dormant users', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA active on day-4, day-3, day-2 (new on first appearance, returning after)
    // personB active on day-4 only (new, then dormant)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: ts(2, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'pageview', timestamp: ts(4, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'pageview',
      granularity: 'day',
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    expect(result.granularity).toBe('day');
    expect(result.data.length).toBeGreaterThanOrEqual(3);

    // Day -4: both are new
    const day4 = result.data.find((d) => d.bucket.startsWith(daysAgo(4)));
    expect(day4).toBeDefined();
    expect(day4!.new).toBe(2);

    // Day -3: personA is returning, personB is dormant
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.returning).toBe(1);
    expect(day3!.dormant).toBe(-1);

    // Day -2: personA is returning
    const day2 = result.data.find((d) => d.bucket.startsWith(daysAgo(2)));
    expect(day2).toBeDefined();
    expect(day2!.returning).toBe(1);
  });

  it('classifies resurrecting users', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // person active day-6, inactive day-5 and day-4, active day-3 (resurrecting)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'login', timestamp: ts(6, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'login', timestamp: ts(3, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: daysAgo(6),
      date_to: daysAgo(2),
    });

    // Day -6: new
    const day6 = result.data.find((d) => d.bucket.startsWith(daysAgo(6)));
    expect(day6).toBeDefined();
    expect(day6!.new).toBe(1);

    // Day -3: resurrecting (person was gone for 2 days)
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.resurrecting).toBe(1);
  });
});

describe('queryLifecycle — totals', () => {
  it('computes totals correctly', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(2, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'act', timestamp: ts(3, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'act',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
    });

    expect(result.totals.new).toBe(2);
    expect(result.totals.returning).toBe(1);
    expect(result.totals.dormant).toBeLessThanOrEqual(0);
  });
});

describe('queryLifecycle — empty result', () => {
  it('returns empty data when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'nonexistent',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.data).toHaveLength(0);
    expect(result.totals.new).toBe(0);
    expect(result.totals.returning).toBe(0);
    expect(result.totals.resurrecting).toBe(0);
    expect(result.totals.dormant).toBe(0);
  });
});

describe('queryLifecycle — week granularity', () => {
  it('aggregates by week', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'visit', timestamp: ts(14, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'visit', timestamp: ts(7, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'visit', timestamp: ts(1, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'visit',
      granularity: 'week',
      date_from: daysAgo(14),
      date_to: daysAgo(1),
    });

    expect(result.granularity).toBe('week');
    // daysAgo(14), daysAgo(7), daysAgo(1) span at least 2 distinct ISO weeks
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    // Person's first week bucket may fall before date_from due to week truncation,
    // so 'new' can be 0 or 1 depending on day of week. But total active must be >= 2.
    const totalActive = result.totals.new + result.totals.returning + result.totals.resurrecting;
    expect(totalActive).toBeGreaterThanOrEqual(2);
    // At least some returning/resurrecting activity
    expect(result.totals.returning + result.totals.resurrecting).toBeGreaterThanOrEqual(1);
  });
});
