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
import { queryStickiness, computeTotalPeriods } from '../../analytics/stickiness/stickiness.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryStickiness — basic histogram', () => {
  it('counts users by number of active days', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // personA active 3 days, personB active 1 day, personC active 2 days
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'login', timestamp: ts(3, 12) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.granularity).toBe('day');
    expect(result.total_periods).toBe(3);

    // personB = 1 day, personC = 2 days, personA = 3 days
    const map = new Map(result.data.map((d) => [d.period_count, d.user_count]));
    expect(map.get(1)).toBe(1); // personB
    expect(map.get(2)).toBe(1); // personC
    expect(map.get(3)).toBe(1); // personA
  });

  it('counts multiple events on the same day as one active day', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // person fires 3 events on the same day
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 14) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 16) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'click',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(1),
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(1);
    expect(result.data[0].user_count).toBe(1);
  });
});

describe('queryStickiness — empty result', () => {
  it('returns empty data when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'nonexistent',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total_periods).toBe(3);
  });
});

describe('computeTotalPeriods', () => {
  it('computes day periods', () => {
    expect(computeTotalPeriods(daysAgo(5), daysAgo(1), 'day')).toBe(5);
    expect(computeTotalPeriods(daysAgo(0), daysAgo(0), 'day')).toBe(1);
  });

  it('computes week periods', () => {
    expect(computeTotalPeriods(daysAgo(14), daysAgo(0), 'week')).toBe(3);
  });

  it('computes month periods', () => {
    const now = new Date();
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 2);
    expect(computeTotalPeriods(from.toISOString().slice(0, 10), now.toISOString().slice(0, 10), 'month')).toBe(3);
  });
});

describe('queryStickiness — week granularity', () => {
  it('counts users by number of active weeks', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // person active in 2 different weeks
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'visit', timestamp: ts(14, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'visit', timestamp: ts(1, 12) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'visit',
      granularity: 'week',
      date_from: daysAgo(14),
      date_to: daysAgo(1),
    });

    expect(result.granularity).toBe('week');
    // Person should have >= 1 active weeks
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const totalUsers = result.data.reduce((sum, d) => sum + d.user_count, 0);
    expect(totalUsers).toBe(1);
  });
});
