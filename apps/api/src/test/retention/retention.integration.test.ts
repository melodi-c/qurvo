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
import { queryRetention } from '../../analytics/retention/retention.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryRetention — recurring', () => {
  it('basic recurring retention with day granularity', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA does event on day-5, day-4, day-3
    // personB does event on day-5 only
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: ts(5, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
    });

    expect(result.retention_type).toBe('recurring');
    expect(result.granularity).toBe('day');
    expect(result.cohorts).toHaveLength(1);

    const cohort = result.cohorts[0];
    expect(cohort.cohort_size).toBe(2); // personA + personB
    expect(cohort.periods[0]).toBe(2);  // period 0: both
    expect(cohort.periods[1]).toBe(1);  // period 1: personA only
    expect(cohort.periods[2]).toBe(1);  // period 2: personA only
  });

  it('multiple cohort dates', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Cohort day-6: personA
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'visit', timestamp: ts(6, 10) }),
      // Cohort day-5: personA + personB
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'visit', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'visit', timestamp: ts(5, 10) }),
      // Return day-4: personA
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'visit', timestamp: ts(4, 10) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'visit',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 2,
      date_from: daysAgo(6),
      date_to: daysAgo(5),
    });

    expect(result.cohorts).toHaveLength(2);

    // Cohort day-6: size=1 (personA), period_1=1 (personA returned day-5)
    const cohort0 = result.cohorts[0];
    expect(cohort0.cohort_size).toBe(1);
    expect(cohort0.periods[1]).toBe(1);

    // Cohort day-5: size=2, period_1=1 (only personA returned day-4)
    const cohort1 = result.cohorts[1];
    expect(cohort1.cohort_size).toBe(2);
    expect(cohort1.periods[1]).toBe(1);
  });
});

describe('queryRetention — first_time', () => {
  it('only counts first-ever occurrence as cohort date', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // personA first does event on day-10, then again on day-5 and day-4
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: ts(10, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: ts(4, 12) }),
    ]);

    // Query range: day-6 to day-3 → personA's first event is day-10, outside range
    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'signup',
      retention_type: 'first_time',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(6),
      date_to: daysAgo(3),
    });

    // personA's cohort_date is day-10, which is outside our query range → no cohorts
    expect(result.cohorts).toHaveLength(0);
  });

  it('includes user when first event is within range', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA first event day-5, returns day-4
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: ts(4, 12) }),
      // personB first event day-5
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'signup', timestamp: ts(5, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'signup',
      retention_type: 'first_time',
      granularity: 'day',
      periods: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
    });

    expect(result.cohorts).toHaveLength(1);
    const cohort = result.cohorts[0];
    expect(cohort.cohort_size).toBe(2);
    expect(cohort.periods[0]).toBe(2);
    expect(cohort.periods[1]).toBe(1); // only personA
  });
});

describe('queryRetention — week granularity', () => {
  it('buckets events into weekly cohorts', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Events spanning 3 weeks
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(14, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(7, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(1, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'week',
      periods: 2,
      date_from: daysAgo(14),
      date_to: daysAgo(7),
    });

    expect(result.granularity).toBe('week');
    // Should have 1-2 weekly cohorts depending on week boundaries
    expect(result.cohorts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('queryRetention — edge cases', () => {
  it('no returning events → periods[1..N] = 0', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'login', timestamp: ts(5, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
    });

    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0].cohort_size).toBe(2);
    expect(result.cohorts[0].periods[0]).toBe(2);
    expect(result.cohorts[0].periods[1]).toBe(0);
    expect(result.cohorts[0].periods[2]).toBe(0);
    expect(result.cohorts[0].periods[3]).toBe(0);
  });

  it('empty result when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'nonexistent',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.cohorts).toHaveLength(0);
    expect(result.average_retention).toEqual([0, 0, 0, 0]);
  });

  it('average retention computed correctly across cohorts', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Cohort day-6: personA, personB (size=2)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(6, 10) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'act', timestamp: ts(6, 10) }),
      // Return day-5: personA (1/2 = 50%)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(5, 10) }),
      // Cohort day-5: personA, personB, personC (size=3 for recurring)
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'act', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'act', timestamp: ts(5, 10) }),
      // Return day-4: personA (for day-5 cohort: 1/3 ≈ 33.33%)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(4, 10) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'act',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 1,
      date_from: daysAgo(6),
      date_to: daysAgo(5),
    });

    expect(result.cohorts).toHaveLength(2);
    // average_retention[0] should be 100% (all cohort members are present at period 0)
    expect(result.average_retention[0]).toBe(100);
    // Cohort day-6: size=1 (personA), period_1: personA returns day-5 → 100%
    // Cohort day-5: size=3 (A+B+C), period_1: personA returns day-4 → 33.33%
    // average_retention[1] = avg of (100%, 33.33%) ≈ 66.67%
    expect(result.average_retention[1]).toBeGreaterThan(65);
    expect(result.average_retention[1]).toBeLessThan(68);
  });
});
