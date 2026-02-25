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
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { queryRetention } from '../../analytics/retention/retention.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── Inline date helpers ──────────────────────────────────────────────────────

/**
 * Returns an ISO timestamp for the Monday (noon UTC) of the ISO week
 * that contains the date N days ago.
 * This ensures events are placed at the start of their week bucket, so they
 * are always captured by the retention query's truncated date window.
 */
function mondayOfWeekContaining(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(12, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // ISO Monday = 1, Sunday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString();
}

/**
 * Returns an ISO timestamp for the 1st of the month (noon UTC) that contains
 * the date N days ago.
 * This ensures events are placed at the start of their month bucket, so they
 * are always captured by the retention query's truncated date window.
 */
function firstOfMonthContaining(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12, 0, 0, 0)).toISOString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

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

  it('excludes user whose first event is before date_from', async () => {
    const projectId = randomUUID();
    const earlyUser = randomUUID();
    const newUser = randomUUID();

    // earlyUser first did the event 60 days ago (well before date_from = daysAgo(7))
    // They come back within the query range but must NOT appear in the first_time cohort.
    // newUser first did the event at daysAgo(7) (exactly at date_from) → IS included.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: earlyUser, distinct_id: 'early', event_name: 'page_view', timestamp: ts(60, 12) }),
      buildEvent({ project_id: projectId, person_id: earlyUser, distinct_id: 'early', event_name: 'page_view', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: earlyUser, distinct_id: 'early', event_name: 'page_view', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: newUser, distinct_id: 'new', event_name: 'page_view', timestamp: ts(7, 12) }),
      buildEvent({ project_id: projectId, person_id: newUser, distinct_id: 'new', event_name: 'page_view', timestamp: ts(6, 12) }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'page_view',
      retention_type: 'first_time',
      granularity: 'day',
      periods: 2,
      date_from: daysAgo(7),
      date_to: daysAgo(5),
    });

    // earlyUser is excluded because their first event was day-60 (before date_from).
    // Only newUser (first event = day-7 = date_from) appears in the cohort.
    expect(result.cohorts).toHaveLength(1);
    const cohort = result.cohorts[0];
    // cohort for day-7: only newUser
    expect(cohort.cohort_size).toBe(1);
    // newUser returned on day-6 → period_1 = 1
    expect(cohort.periods[1]).toBe(1);
  });
});

describe('queryRetention — week granularity', () => {
  it('buckets events into weekly cohorts', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Place events on the Monday of each target week to guarantee they land
    // within the truncated date window (retention query truncates date_to to
    // the start of its ISO week, so events must be <= that Monday at 23:59:59).
    const week1Monday = mondayOfWeekContaining(21); // Monday of 3 weeks ago
    const week2Monday = mondayOfWeekContaining(14); // Monday of 2 weeks ago
    const week3Event = ts(1, 12);                   // last day for return check

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: week1Monday }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: week2Monday }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: week3Event }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'week',
      periods: 2,
      date_from: daysAgo(21),
      date_to: daysAgo(7),
    });

    expect(result.granularity).toBe('week');
    // Events at Monday of week-3 and Monday of week-2 each fall in a distinct
    // ISO week bucket, producing exactly 2 cohorts.
    expect(result.cohorts.length).toBe(2);
    // Each week had exactly 1 person
    expect(result.cohorts[0].cohort_size).toBe(1);
    expect(result.cohorts[1].cohort_size).toBe(1);
  });
});

describe('queryRetention — month granularity', () => {
  it('buckets events into monthly cohorts and tracks cross-month retention', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Place events on the 1st of each target month to guarantee they land
    // within the truncated date window (retention query truncates date_to to
    // the 1st of its month, so events must be <= that 1st at 23:59:59).
    const month1First = firstOfMonthContaining(60); // 1st of the month 60 days ago
    const month2First = firstOfMonthContaining(30); // 1st of the month 30 days ago

    // personA does event in both months; personB does event only in month1
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: month1First }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: month2First }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: month1First }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'month',
      periods: 1,
      date_from: daysAgo(60),
      date_to: daysAgo(30),
    });

    expect(result.granularity).toBe('month');
    // daysAgo(60) and daysAgo(30) are 30 days apart → always in different months.
    // Events placed on the 1st of each month are always within the truncated window.
    expect(result.cohorts.length).toBe(2);

    // First cohort (older month): personA and personB (size=2)
    const firstCohort = result.cohorts[0];
    expect(firstCohort.cohort_size).toBe(2);
    // Only personA returned in the next month (period_1 = 1)
    expect(firstCohort.periods[1]).toBe(1);

    // Second cohort (newer month): only personA (size=1)
    const secondCohort = result.cohorts[1];
    expect(secondCohort.cohort_size).toBe(1);
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
      // Return day-5: personA only for cohort day-6 (1/2 = 50%)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(5, 10) }),
      // Cohort day-5 (recurring): personA, personB, personC (size=3)
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'act', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'act', timestamp: ts(5, 10) }),
      // Return day-4: personA only for cohort day-5 (1/3 ≈ 33.33%)
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
    // average_retention[0] = 100% (all cohort members present at period 0 by definition)
    expect(result.average_retention[0]).toBe(100);
    // Cohort day-6: size=2 (A+B), period_1: both returned on day-5 → 2/2 = 100%
    // Cohort day-5: size=3 (A+B+C), period_1: only A returned day-4 → 1/3 ≈ 33.33%
    // average_retention[1] = (100% + 33.33%) / 2 = 66.67%
    expect(result.average_retention[1]).toBeCloseTo(66.67, 1);
  });
});

describe('queryRetention — event property filters', () => {
  it('filters initial and return events by event property', async () => {
    const projectId = randomUUID();
    const organicUser = randomUUID();
    const paidUser = randomUUID();

    // organicUser: source=organic, active on day-5 and day-4
    // paidUser: source=paid, active on day-5 and day-4 (excluded by filter)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: organicUser,
        distinct_id: 'organic',
        event_name: 'page_view',
        properties: JSON.stringify({ source: 'organic' }),
        timestamp: ts(5, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: organicUser,
        distinct_id: 'organic',
        event_name: 'page_view',
        properties: JSON.stringify({ source: 'organic' }),
        timestamp: ts(4, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: paidUser,
        distinct_id: 'paid',
        event_name: 'page_view',
        properties: JSON.stringify({ source: 'paid' }),
        timestamp: ts(5, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: paidUser,
        distinct_id: 'paid',
        event_name: 'page_view',
        properties: JSON.stringify({ source: 'paid' }),
        timestamp: ts(4, 12),
      }),
    ]);

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'page_view',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 1,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      filters: [{ property: 'properties.source', operator: 'eq', value: 'organic' }],
    });

    expect(result.cohorts).toHaveLength(1);
    // Only organicUser satisfies the filter — paidUser is excluded
    expect(result.cohorts[0].cohort_size).toBe(1);
    // organicUser returned on day-4 with source=organic → period_1 = 1
    expect(result.cohorts[0].periods[1]).toBe(1);
  });
});

describe('queryRetention — cohort filters', () => {
  it('restricts cohort to users matching inline cohort definition', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // Both users perform 'login' on day-5 and day-4, but only premiumUser has plan=premium.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(5, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(4, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(5, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(4, 12),
      }),
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

    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 1,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_filters: [cohortFilter],
    });

    expect(result.cohorts).toHaveLength(1);
    // freeUser is filtered out by the cohort definition; only premiumUser remains
    expect(result.cohorts[0].cohort_size).toBe(1);
    // premiumUser also returned on day-4 → period_1 = 1
    expect(result.cohorts[0].periods[1]).toBe(1);
  });
});
