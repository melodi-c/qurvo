import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { CohortConditionGroup } from '@qurvo/db';
import { queryLifecycle } from '../../analytics/lifecycle/lifecycle.query';
import { materializeCohort } from '../cohorts/helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryLifecycle — event property filters', () => {
  it('restricts lifecycle analysis to events matching the property filter', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // premiumUser fires events with properties.plan = 'premium' on day-3 and day-2
    // freeUser fires events with properties.plan = 'free' on day-3 and day-2
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(2, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(2, 12),
      }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'purchase',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      event_filters: [{ property: 'properties.plan', operator: 'eq', value: 'premium' }],
    });

    // Only premiumUser's events satisfy the filter — freeUser must be excluded
    expect(result.totals.new).toBe(1);
    expect(result.totals.returning).toBe(1);

    // Day -3: premiumUser is new (freeUser excluded by filter)
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.new).toBe(1);

    // Day -2: premiumUser is returning
    const day2 = result.data.find((d) => d.bucket.startsWith(daysAgo(2)));
    expect(day2).toBeDefined();
    expect(day2!.returning).toBe(1);
  });
});

describe('queryLifecycle — multiple resurrection cycles', () => {
  it('correctly classifies a user who resurrects more than once', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Activity pattern across days (day granularity):
    //   day-8: active  → new
    //   day-7: inactive → dormant
    //   day-6: active  → resurrecting (first resurrection)
    //   day-5: inactive → dormant
    //   day-4: active  → resurrecting (second resurrection)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ping', timestamp: ts(8, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ping', timestamp: ts(6, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ping', timestamp: ts(4, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'ping',
      granularity: 'day',
      date_from: daysAgo(8),
      date_to: daysAgo(3),
    });

    // Day -8: first ever event → new
    const day8 = result.data.find((d) => d.bucket.startsWith(daysAgo(8)));
    expect(day8).toBeDefined();
    expect(day8!.new).toBe(1);

    // Day -7: person was active day-8 but not day-7 → dormant.
    // dormant count is returned as a negative number by design:
    // it represents users who were active in the previous period but not in the current one.
    // Using negative values allows rendering as a "below zero" bar in stacked charts.
    const day7 = result.data.find((d) => d.bucket.startsWith(daysAgo(7)));
    expect(day7).toBeDefined();
    expect(day7!.dormant).toBeLessThan(0);
    expect(Math.abs(day7!.dormant)).toBe(1); // exactly 1 user went dormant

    // Day -6: person re-appeared after a gap → resurrecting (first cycle)
    const day6 = result.data.find((d) => d.bucket.startsWith(daysAgo(6)));
    expect(day6).toBeDefined();
    expect(day6!.resurrecting).toBe(1);

    // Day -5: person was active day-6 but not day-5 → dormant again
    const day5 = result.data.find((d) => d.bucket.startsWith(daysAgo(5)));
    expect(day5).toBeDefined();
    expect(day5!.dormant).toBeLessThan(0);
    expect(Math.abs(day5!.dormant)).toBe(1); // exactly 1 user went dormant again

    // Day -4: person re-appeared after another gap → resurrecting (second cycle)
    const day4 = result.data.find((d) => d.bucket.startsWith(daysAgo(4)));
    expect(day4).toBeDefined();
    expect(day4!.resurrecting).toBe(1);

    // Total resurrecting across the date range should be 2 (two resurrection events)
    expect(result.totals.resurrecting).toBe(2);
  });
});

describe('queryLifecycle — dormant semantics', () => {
  it('returns dormant count as a negative number representing users who stopped being active', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // All three users active on day-4.
    // Only personA active on day-3 (personB and personC go dormant after day-4).
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'use', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'use', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'use', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'use', timestamp: ts(4, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'use',
      granularity: 'day',
      date_from: daysAgo(4),
      date_to: daysAgo(3),
    });

    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();

    // dormant count is returned as a negative number by design:
    // it represents users who were active in the previous period but not in the current one.
    // Using negative values allows rendering as a "below zero" bar in stacked charts.
    expect(day3!.dormant).toBeLessThan(0);
    // personB and personC were active on day-4 but not day-3 → 2 users went dormant
    expect(Math.abs(day3!.dormant)).toBe(2);
  });
});

describe('queryLifecycle — cohort filters', () => {
  it('restricts lifecycle analysis to members of an inline (non-materialized) cohort', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // Both users fire events on day-3 and day-2
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(2, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(2, 12),
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

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'action',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      cohort_filters: [cohortFilter],
    });

    // Only premiumUser is in the cohort — freeUser must be excluded
    expect(result.totals.new).toBe(1);
    expect(result.totals.returning).toBe(1);

    // Day -3: only premiumUser (1 new)
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.new).toBe(1);

    // Day -2: premiumUser returning (1 returning)
    const day2 = result.data.find((d) => d.bucket.startsWith(daysAgo(2)));
    expect(day2).toBeDefined();
    expect(day2!.returning).toBe(1);
  });

  it('restricts lifecycle analysis to members of a materialized cohort', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(2, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'action',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(2, 12),
      }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'action',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      cohort_filters: [{ cohort_id: cohortId, definition, materialized: true, is_static: false }],
    });

    // Only premiumUser is in the materialized cohort
    expect(result.totals.new).toBe(1);
    expect(result.totals.returning).toBe(1);

    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.new).toBe(1);

    const day2 = result.data.find((d) => d.bucket.startsWith(daysAgo(2)));
    expect(day2).toBeDefined();
    expect(day2!.returning).toBe(1);
  });
});

describe('queryLifecycle — new vs resurrecting with deep history', () => {
  it('classifies as resurrecting (not new) a user active 2+ periods ago who skipped 1 period', async () => {
    // Regression test for: extended_from lookback was only 1 period, causing users
    // active 2+ periods ago to be misclassified as 'new' instead of 'resurrecting'.
    //
    // Scenario (day granularity, date_from = daysAgo(1)):
    //   day-2: user fires the event   <- outside the 1-period extended window
    //   day-1: user is INACTIVE       <- extended_from boundary; user absent from visible range start
    //   day-0 (today): user fires the event again
    //
    // With the old 1-period lookback the query would not see the day-2 event, so
    // first_bucket = today and the user would be classified as 'new'.
    // The correct answer is 'resurrecting' (user has prior history from day-2).

    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Active 2 days ago -- outside extended_from window when date_from = daysAgo(1)
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ev', timestamp: ts(2, 12) }),
      // Inactive on daysAgo(1) (no event inserted)
      // Active today
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ev', timestamp: ts(0, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'day',
      date_from: daysAgo(1),
      date_to: daysAgo(0),
    });

    // Today's bucket: user re-appeared after a 1-day gap -> resurrecting, NOT new
    const today = result.data.find((d) => d.bucket.startsWith(daysAgo(0)));
    expect(today).toBeDefined();
    expect(today!.resurrecting).toBe(1);
    expect(today!.new).toBe(0);
  });

  it('classifies as resurrecting a user active many periods ago and inactive for the whole visible range except today', async () => {
    // User was active 10 days ago and returns today.
    // date_from = daysAgo(3). extended_from = daysAgo(4).
    // The user's event at daysAgo(10) is older than extended_from -> prior_active detects it.

    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ev', timestamp: ts(10, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ev', timestamp: ts(0, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(0),
    });

    const today = result.data.find((d) => d.bucket.startsWith(daysAgo(0)));
    expect(today).toBeDefined();
    expect(today!.resurrecting).toBe(1);
    expect(today!.new).toBe(0);
  });

  it('still classifies as new a user whose first event ever is within the visible range', async () => {
    // User's very first event is today -- must remain 'new'.

    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'u', event_name: 'ev', timestamp: ts(0, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(0),
    });

    const today = result.data.find((d) => d.bucket.startsWith(daysAgo(0)));
    expect(today).toBeDefined();
    expect(today!.new).toBe(1);
    expect(today!.resurrecting).toBe(0);
  });
});
