import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryRetention } from '../../analytics/retention/retention.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryRetention — periods: 0', () => {
  it('returns only period 0 (the cohort itself) without follow-up periods', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Two users both fire 'login' on day-5. With periods=0 we only want the
    // cohort snapshot (period 0) and no return-period tracking at all.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: ts(5, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 0,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
    });

    // Must not throw and must return exactly 1 cohort row
    expect(result.cohorts).toHaveLength(1);

    const cohort = result.cohorts[0];

    // periods array has exactly 1 element: periods[0] = cohort size
    expect(cohort.periods).toHaveLength(1);
    expect(cohort.cohort_size).toBe(2);
    expect(cohort.periods[0]).toBe(2);

    // average_retention has exactly 1 element: always 100% at period 0
    expect(result.average_retention).toHaveLength(1);
    expect(result.average_retention[0]).toBe(100);
  });

  it('periods: 0 with first_time retention — cohort size reflects first-event users only', async () => {
    const projectId = randomUUID();
    const newUser = randomUUID();
    const returningUser = randomUUID();

    // returningUser's first event was long ago (before date_from) — excluded from first_time cohort
    // newUser's first event falls within the query range — included
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: returningUser, distinct_id: 'old', event_name: 'signup', timestamp: ts(60, 12) }),
      buildEvent({ project_id: projectId, person_id: returningUser, distinct_id: 'old', event_name: 'signup', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: newUser, distinct_id: 'new', event_name: 'signup', timestamp: ts(5, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'signup',
      retention_type: 'first_time',
      granularity: 'day',
      periods: 0,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
    });

    // Only newUser qualifies (first event within range)
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0].periods).toHaveLength(1);
    expect(result.cohorts[0].cohort_size).toBe(1);
    expect(result.cohorts[0].periods[0]).toBe(1);

    expect(result.average_retention).toHaveLength(1);
    expect(result.average_retention[0]).toBe(100);
  });

  it('periods: 0 with no matching events — returns empty cohorts', async () => {
    const projectId = randomUUID();

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'nonexistent_event',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 0,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.cohorts).toHaveLength(0);
    // average_retention has 1 element (periods + 1 = 1) but all zeros
    expect(result.average_retention).toHaveLength(1);
    expect(result.average_retention[0]).toBe(0);
  });
});
