import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryStickiness, computeTotalPeriods } from '../../analytics/stickiness/stickiness.query';
import type { CohortConditionGroup } from '@qurvo/db';
import { materializeCohort } from '../cohorts/helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
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
      timezone: 'UTC',
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
      timezone: 'UTC',
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
      timezone: 'UTC',
    });

    expect(result.data).toHaveLength(0);
    expect(result.total_periods).toBe(3);
  });
});

describe('computeTotalPeriods', () => {
  it('computes day periods', () => {
    expect(computeTotalPeriods(daysAgo(5), daysAgo(1), 'day', 'UTC')).toBe(5);
    expect(computeTotalPeriods(daysAgo(0), daysAgo(0), 'day', 'UTC')).toBe(1);
  });

  it('computes week periods', () => {
    // daysAgo(14) to daysAgo(0) spans exactly 14 days (15 days inclusive).
    // This touches 3 ISO-week buckets: the start week, a full middle week, and the end week.
    expect(computeTotalPeriods(daysAgo(14), daysAgo(0), 'week', 'UTC')).toBe(3);
  });

  it('computes week periods correctly for mid-week boundaries (ISO week alignment)', () => {
    // Thursday 2024-01-04 to Wednesday 2024-01-10 = 6 days, but crosses a Monday boundary.
    // ISO week of 2024-01-04 (Thu): starts Mon 2024-01-01.
    // ISO week of 2024-01-10 (Wed): starts Mon 2024-01-08.
    // → 2 distinct ISO week buckets, not 1.
    expect(computeTotalPeriods('2024-01-04', '2024-01-10', 'week', 'UTC')).toBe(2);

    // Monday 2024-01-01 to Sunday 2024-01-07 = same ISO week → 1 bucket.
    expect(computeTotalPeriods('2024-01-01', '2024-01-07', 'week', 'UTC')).toBe(1);

    // Monday 2024-01-01 to Sunday 2024-01-14 → 2 ISO week buckets (week1 + week2).
    expect(computeTotalPeriods('2024-01-01', '2024-01-14', 'week', 'UTC')).toBe(2);
  });

  it('computes month periods', () => {
    const now = new Date();
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 2);
    expect(computeTotalPeriods(from.toISOString().slice(0, 10), now.toISOString().slice(0, 10), 'month', 'UTC')).toBe(3);
  });

  it('week periods with timezone produce the same result as UTC for calendar-date boundaries', () => {
    // Calendar dates have an invariant day-of-week regardless of timezone.
    // 2024-01-04 (Thu) to 2024-01-10 (Wed) → 2 ISO week buckets in any timezone.
    expect(computeTotalPeriods('2024-01-04', '2024-01-10', 'week', 'America/New_York')).toBe(2);
    expect(computeTotalPeriods('2024-01-04', '2024-01-10', 'week', 'Asia/Tokyo')).toBe(2);

    // Monday-to-Sunday within one ISO week → 1 bucket.
    expect(computeTotalPeriods('2024-01-01', '2024-01-07', 'week', 'America/New_York')).toBe(1);

    // Monday 2024-01-01 to Sunday 2024-01-14 → 2 buckets.
    expect(computeTotalPeriods('2024-01-01', '2024-01-14', 'week', 'Europe/London')).toBe(2);

    // 'UTC' explicit timezone must match the no-timezone path.
    expect(computeTotalPeriods('2024-01-04', '2024-01-10', 'week', 'UTC')).toBe(2);
  });

  it('day periods are unaffected by timezone', () => {
    expect(computeTotalPeriods(daysAgo(5), daysAgo(1), 'day', 'America/New_York')).toBe(5);
    expect(computeTotalPeriods(daysAgo(5), daysAgo(1), 'day', 'Asia/Tokyo')).toBe(5);
  });

  it('month periods are unaffected by timezone', () => {
    const now = new Date();
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 2);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = now.toISOString().slice(0, 10);
    expect(computeTotalPeriods(fromStr, toStr, 'month', 'America/New_York')).toBe(3);
    expect(computeTotalPeriods(fromStr, toStr, 'month', 'Asia/Tokyo')).toBe(3);
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
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('week');
    // daysAgo(14) and daysAgo(1) always fall in different ISO weeks,
    // so person has exactly 2 active weeks
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(2);
    expect(result.data[0].user_count).toBe(1);
  });

  it('correctly buckets multiple users across different weeks', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: events at daysAgo(28) and daysAgo(14) — exactly 2 weeks apart, always different ISO weeks → 2 active weeks
    // personB: event at daysAgo(28) only → 1 active week
    // Multiple events for personA within the same week count as 1 week period.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: 'action', timestamp: ts(28, 10) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: 'action', timestamp: ts(28, 14) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: 'action', timestamp: ts(14, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'pb', event_name: 'action', timestamp: ts(28, 9) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'action',
      granularity: 'week',
      date_from: daysAgo(35),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('week');
    const map = new Map(result.data.map((d) => [d.period_count, d.user_count]));
    expect(map.get(1)).toBe(1); // personB: 1 active week
    expect(map.get(2)).toBe(1); // personA: 2 active weeks
  });
});

describe('queryStickiness — month granularity', () => {
  it('counts users by number of active months', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Build timestamps in different calendar months.
    // 60 days ago and 30 days ago are guaranteed to cross at least one month boundary.
    // 5 days ago is in the current (or very recent) month.
    const ts60 = new Date(Date.now() - 60 * 86_400_000);
    const ts30 = new Date(Date.now() - 30 * 86_400_000);
    const ts5  = new Date(Date.now() - 5  * 86_400_000);
    ts60.setUTCHours(12, 0, 0, 0);
    ts30.setUTCHours(12, 0, 0, 0);
    ts5.setUTCHours(12, 0, 0, 0);

    // personA: active in up to 3 different calendar months
    // personB: active only in the most recent month
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: 'session', timestamp: ts60.toISOString() }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: 'session', timestamp: ts30.toISOString() }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: 'session', timestamp: ts5.toISOString() }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'pb', event_name: 'session', timestamp: ts5.toISOString() }),
    ]);

    // Dynamically determine how many distinct months personA's events span.
    // (60d and 30d ago are always in different months; 5d ago may or may not share a month with 30d ago.)
    const personAMonths = new Set([
      `${ts60.getUTCFullYear()}-${ts60.getUTCMonth()}`,
      `${ts30.getUTCFullYear()}-${ts30.getUTCMonth()}`,
      `${ts5.getUTCFullYear()}-${ts5.getUTCMonth()}`,
    ]);
    const personAExpectedMonths = personAMonths.size; // 2 or 3

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'session',
      granularity: 'month',
      date_from: daysAgo(65),
      date_to: daysAgo(0),
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('month');
    expect(result.total_periods).toBeGreaterThanOrEqual(3);

    const map = new Map(result.data.map((d) => [d.period_count, d.user_count]));
    // personB was active in 1 month
    expect(map.get(1)).toBe(1);
    // personA was active in personAExpectedMonths months
    expect(map.get(personAExpectedMonths)).toBe(1);
  });
});

describe('queryStickiness — long periods (30+ days)', () => {
  it('correctly counts stickiness over a 45-day range', async () => {
    const projectId = randomUUID();
    const heavyUser = randomUUID();
    const lightUser = randomUUID();

    // heavyUser: active on every odd-numbered day from daysAgo(45) to daysAgo(3):
    // 45, 43, 41, ..., 3 → 22 distinct days.
    const heavyEvents = [];
    for (let d = 45; d >= 3; d -= 2) {
      heavyEvents.push(
        buildEvent({ project_id: projectId, person_id: heavyUser, distinct_id: 'heavy', event_name: 'use', timestamp: ts(d, 12) }),
      );
    }

    // lightUser: active on only 2 days (both ends of the range)
    const lightEvents = [
      buildEvent({ project_id: projectId, person_id: lightUser, distinct_id: 'light', event_name: 'use', timestamp: ts(45, 12) }),
      buildEvent({ project_id: projectId, person_id: lightUser, distinct_id: 'light', event_name: 'use', timestamp: ts(2, 12) }),
    ];

    await insertTestEvents(ctx.ch, [...heavyEvents, ...lightEvents]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'use',
      granularity: 'day',
      date_from: daysAgo(45),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('day');
    expect(result.total_periods).toBe(45);

    // lightUser active on 2 distinct days
    const lightEntry = result.data.find((d) => d.period_count === 2);
    expect(lightEntry).toBeDefined();
    expect(lightEntry!.user_count).toBe(1);

    // heavyUser active on 22 distinct days (45,43,...,3)
    const heavyEntry = result.data.find((d) => d.period_count === 22);
    expect(heavyEntry).toBeDefined();
    expect(heavyEntry!.user_count).toBe(1);
  });
});

describe('queryStickiness — user_properties filters', () => {
  it('filters by user_properties.* in filters', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // premiumUser fires events with user_properties.plan = 'premium' on 3 different days
    // freeUser fires events with user_properties.plan = 'free' on 2 different days
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(4, 12) }),
    ]);

    // Filter to premium users only via user_properties — freeUser must not appear
    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
      filters: [{ property: 'user_properties.plan', operator: 'eq', value: 'premium' }],
    });

    expect(result.granularity).toBe('day');
    // Only premiumUser should appear with 3 active days
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(3);
    expect(result.data[0].user_count).toBe(1);
  });
});

describe('queryStickiness — event property filters', () => {
  it('restricts active period counting to events matching the filter', async () => {
    const projectId = randomUUID();
    const mobileUser = randomUUID();
    const webUser = randomUUID();

    // mobileUser fires 'page_view' with platform=mobile on 3 different days
    // webUser fires 'page_view' with platform=web on 2 different days
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: mobileUser, distinct_id: 'mob', event_name: 'page_view', properties: JSON.stringify({ platform: 'mobile' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: mobileUser, distinct_id: 'mob', event_name: 'page_view', properties: JSON.stringify({ platform: 'mobile' }), timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: mobileUser, distinct_id: 'mob', event_name: 'page_view', properties: JSON.stringify({ platform: 'mobile' }), timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: webUser, distinct_id: 'web', event_name: 'page_view', properties: JSON.stringify({ platform: 'web' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: webUser, distinct_id: 'web', event_name: 'page_view', properties: JSON.stringify({ platform: 'web' }), timestamp: ts(4, 12) }),
    ]);

    // Filter to mobile events only — webUser must not appear in results
    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'page_view',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
      filters: [{ property: 'properties.platform', operator: 'eq', value: 'mobile' }],
    });

    expect(result.granularity).toBe('day');
    // Only mobileUser should appear with 3 active days
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(3);
    expect(result.data[0].user_count).toBe(1);
  });

  it('returns empty result when no events match the property filter', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'click', properties: JSON.stringify({ source: 'organic' }), timestamp: ts(3, 12) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'click',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
      filters: [{ property: 'properties.source', operator: 'eq', value: 'paid' }],
    });

    expect(result.data).toHaveLength(0);
  });
});

describe('queryStickiness — cohort filters', () => {
  it('restricts stickiness to inline cohort members only', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // Both users fire 3 days of events, but only premiumUser is in the cohort
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(3, 12) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
      cohort_filters: [{
        cohort_id: randomUUID(),
        definition: {
          type: 'AND',
          values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
        },
        materialized: false,
        is_static: false,
      }],
    });

    // Only premiumUser should be counted — 3 active days
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(3);
    expect(result.data[0].user_count).toBe(1);
  });

  it('restricts stickiness to materialized cohort members only', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'prem', event_name: 'login', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'login', user_properties: JSON.stringify({ plan: 'free' }), timestamp: ts(2, 12) }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
      cohort_filters: [{ cohort_id: cohortId, definition, materialized: true, is_static: false }],
    });

    // Only premiumUser is in the materialized cohort — 2 active days
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(2);
    expect(result.data[0].user_count).toBe(1);
  });
});

describe('queryStickiness — timezone-aware total_periods', () => {
  it('total_periods with America/New_York timezone matches ClickHouse DISTINCT week bucket count', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Place events 28 and 14 days ago — they are always in two different ISO weeks.
    // 28 days = exactly 4 weeks, so daysAgo(28) and daysAgo(14) are both Mondays
    // relative to today, guaranteed to be in different weeks.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'login', timestamp: ts(28, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'login', timestamp: ts(14, 12) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'week',
      date_from: daysAgo(28),
      date_to: daysAgo(1),
      timezone: 'America/New_York',
    });

    // The person fired events in 2 distinct week buckets.
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(2);
    expect(result.data[0].user_count).toBe(1);

    // total_periods must be >= 2 (it covers 27 days = at least 4-5 week buckets).
    // Most importantly it must be a positive integer — the timezone path must not
    // produce NaN or 0.
    expect(result.total_periods).toBeGreaterThanOrEqual(2);
    expect(Number.isInteger(result.total_periods)).toBe(true);

    // Verify total_periods matches what computeTotalPeriods computes with timezone.
    const expected = computeTotalPeriods(daysAgo(28), daysAgo(1), 'week', 'America/New_York');
    expect(result.total_periods).toBe(expected);
  });

  it('total_periods with UTC timezone gives correct results', async () => {
    const from = '2024-01-01';
    const to = '2024-01-21'; // 3 ISO weeks (Mon 1, Mon 8, Mon 15)
    const withUtc = computeTotalPeriods(from, to, 'week', 'UTC');
    expect(withUtc).toBe(3);
  });
});

describe('queryStickiness — zero active periods', () => {
  it('excludes users whose events fall entirely outside the query date range', async () => {
    const projectId = randomUUID();
    const outsideUser = randomUUID();
    const insideUser = randomUUID();

    // outsideUser only has events at daysAgo(30), outside the window daysAgo(5)..daysAgo(1)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: outsideUser, distinct_id: 'out', event_name: 'visit', timestamp: ts(30, 12) }),
      // insideUser has 1 event inside the window
      buildEvent({ project_id: projectId, person_id: insideUser, distinct_id: 'in', event_name: 'visit', timestamp: ts(3, 12) }),
    ]);

    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'visit',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    // By design: the query first filters events to the date range, then groups by person.
    // Users with zero events in the range are never included in the CTE — they cannot
    // appear in the output with period_count = 0. This is intentional behaviour.
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(1);
    expect(result.data[0].user_count).toBe(1);

    // Explicitly verify that period_count = 0 is never returned
    const zeroPeriod = result.data.find((d) => d.period_count === 0);
    expect(zeroPeriod).toBeUndefined();
  });
});
