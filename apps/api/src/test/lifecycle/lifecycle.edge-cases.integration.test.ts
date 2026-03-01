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
import { truncateDate, shiftDate } from '../../analytics/query-helpers';
import { materializeCohort } from '../cohorts/helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryLifecycle — user_properties filters', () => {
  it('filters by user_properties.* in filters', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // premiumUser fires events with user_properties.plan = 'premium' on day-3 and day-2
    // freeUser fires events with user_properties.plan = 'free' on day-3 and day-2
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

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'action',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      filters: [{ property: 'user_properties.plan', operator: 'eq', value: 'premium' }],
    });

    // Only premiumUser's events satisfy the user_properties filter — freeUser must be excluded
    expect(result.totals.new).toBe(1);
    expect(result.totals.returning).toBe(1);

    // Day -3: premiumUser is new (freeUser excluded)
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.new).toBe(1);

    // Day -2: premiumUser is returning
    const day2 = result.data.find((d) => d.bucket.startsWith(daysAgo(2)));
    expect(day2).toBeDefined();
    expect(day2!.returning).toBe(1);
  });
});

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
      filters: [{ property: 'properties.plan', operator: 'eq', value: 'premium' }],
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

describe('queryLifecycle — prior_active ignores eventFilterClause', () => {
  it('classifies as resurrecting (not new) a user who had prior events not matching the filter', async () => {
    // Regression test for issue #430:
    // prior_active CTE was applying eventFilterClause, causing users with old events
    // that don't match the filter to be misclassified as 'new' instead of 'resurrecting'.
    //
    // Scenario:
    //   - The query has filter: properties.plan = 'premium'
    //   - The user fired the target event with plan='free' 10 days ago (before the range)
    //   - During the visible range the user fires the event with plan='premium'
    //
    // Expected: user should be classified as 'resurrecting' because they have prior
    // history (regardless of the filter). With the bug, prior_active only sees events
    // that match the filter, so the old 'free' event is invisible and the user appears
    // as 'new'.
    const projectId = randomUUID();
    const user = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Event before date_from with plan='free' — doesn't match the filter but proves prior existence
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'u',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(10, 12),
      }),
      // Event within the visible range with plan='premium' — matches the filter
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'u',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(1, 12),
      }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'purchase',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(0),
      filters: [{ property: 'properties.plan', operator: 'eq', value: 'premium' }],
    });

    // The user should appear once (day-1) with plan='premium' matching the filter
    const day1 = result.data.find((d) => d.bucket.startsWith(daysAgo(1)));
    expect(day1).toBeDefined();

    // CRITICAL: must be resurrecting, not new — user fired the event (as 'free') before the range
    expect(day1!.resurrecting).toBe(1);
    expect(day1!.new).toBe(0);
  });

  it('still classifies as new a user whose first event (matching filter) is within the range and has no prior events at all', async () => {
    // When a user has truly never fired the target event before, they should still
    // be classified as 'new' even when an event_filter is active.
    const projectId = randomUUID();
    const brandNewUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: brandNewUser,
        distinct_id: 'brand-new',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(1, 12),
      }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'purchase',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(0),
      filters: [{ property: 'properties.plan', operator: 'eq', value: 'premium' }],
    });

    const day1 = result.data.find((d) => d.bucket.startsWith(daysAgo(1)));
    expect(day1).toBeDefined();
    expect(day1!.new).toBe(1);
    expect(day1!.resurrecting).toBe(0);
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

describe('queryLifecycle — unaligned date_from (issue #577)', () => {
  it('week granularity: correct classification with unaligned date_from (Wednesday)', async () => {
    // Regression test for issue #577.
    // extendedFrom must be aligned to Monday, not to the raw (unaligned) date_from.
    // Without the fix: shiftDate('Wednesday', -1, 'week') = 'previous Wednesday',
    // which excludes events on Mon–Tue of the look-back week from person_buckets.
    // With the fix: shiftDate(truncateDate('Wednesday', 'week'), -1, 'week') = 'previous Monday',
    // ensuring the full look-back week is captured.
    //
    // Scenario (relative dates, week-based):
    //   week0Monday = Monday of "last week"
    //   week1Monday = Monday of "this week"  ← first visible bucket
    //   date_from = Wednesday of week0 (unaligned)
    //
    //   returningUser fires on Monday of week0 (inside look-back window) and Monday of week1.
    //   newUser fires only on Monday of week1.
    //
    //   week0Monday >= extendedFrom_buggy (Wednesday of week-1)? YES — so week0Monday is
    //   captured in person_buckets even without the fix. The test verifies that classification
    //   is correct (returning/new) with an unaligned date_from.

    const projectId = randomUUID();
    const returningUser = randomUUID();
    const newUser = randomUUID();

    const week0Monday = truncateDate(daysAgo(7), 'week');
    const week1Monday = shiftDate(week0Monday, 1, 'week');
    const dateFromWed = shiftDate(week0Monday, 2, 'day'); // Wednesday of week0

    const week0MondayTs = new Date(`${week0Monday}T12:00:00Z`).getTime();
    const week1MondayTs = new Date(`${week1Monday}T12:00:00Z`).getTime();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: returningUser,
        distinct_id: 'returning',
        event_name: 'action',
        timestamp: new Date(week0MondayTs).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: returningUser,
        distinct_id: 'returning',
        event_name: 'action',
        timestamp: new Date(week1MondayTs).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new-user',
        event_name: 'action',
        timestamp: new Date(week1MondayTs).toISOString(),
      }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'action',
      granularity: 'week',
      date_from: dateFromWed, // unaligned: Wednesday of week0
      date_to: daysAgo(0),
    });

    // week1Monday (>= dateFromWed) is the first visible bucket
    const week1Bucket = result.data.find((d) => d.bucket.startsWith(week1Monday));
    expect(week1Bucket).toBeDefined();
    // returningUser was active in the look-back week (week0Monday) → returning
    expect(week1Bucket!.returning).toBe(1);
    // newUser has no prior history → new
    expect(week1Bucket!.new).toBe(1);
  });

  it('month granularity: correct classification with unaligned mid-month date_from', async () => {
    // Regression for issue #577 — month granularity variant.
    // extendedFrom must be aligned to 1st of month, not the raw date_from.
    // Without the fix: shiftDate('Jan 15', -1, 'month') = 'Dec 15',
    // which excludes events from Dec 1–14 from person_buckets.
    // With the fix: shiftDate(truncateDate('Jan 15', 'month'), -1, 'month') = 'Dec 1'.
    //
    // Scenario:
    //   month1Ago = 1st of 1 month ago  (e.g. 2026-01-01)
    //   month0    = 1st of this month   (e.g. 2026-02-01)  ← first visible bucket
    //   dateFromMid = 15th of month1Ago (e.g. 2026-01-15) ← unaligned date_from
    //
    //   returningUser fires in month1Ago AND in month0.
    //   newUser fires only in month0 (truly new).
    //
    //   month0 (Feb 1) >= dateFromMid (Jan 15) → visible.
    //   has(buckets, prevBucket = month1Ago) with returningUser → returning.

    const projectId = randomUUID();
    const returningUser = randomUUID();
    const newUser = randomUUID();

    const month1Ago = truncateDate(daysAgo(35), 'month'); // 1st of last month
    const month0 = shiftDate(month1Ago, 1, 'month');      // 1st of this month

    // Guard: months must be distinct
    if (month1Ago === month0) {
      return;
    }

    // Unaligned date_from: 15th of month1Ago
    const dateFromMid = shiftDate(month1Ago, 14, 'day'); // e.g. Jan 15

    const month1AgoTs = new Date(`${month1Ago}T12:00:00Z`).getTime();
    const month0Ts = new Date(`${month0}T12:00:00Z`).getTime();

    await insertTestEvents(ctx.ch, [
      // returningUser: active in month1Ago (look-back) AND month0 (visible)
      buildEvent({
        project_id: projectId,
        person_id: returningUser,
        distinct_id: 'ret',
        event_name: 'ev',
        timestamp: new Date(month1AgoTs).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: returningUser,
        distinct_id: 'ret',
        event_name: 'ev',
        timestamp: new Date(month0Ts).toISOString(),
      }),
      // newUser: active only in month0
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new-u',
        event_name: 'ev',
        timestamp: new Date(month0Ts).toISOString(),
      }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'month',
      date_from: dateFromMid, // unaligned: 15th of month1Ago
      date_to: daysAgo(0),
    });

    // month0 (1st of this month) >= dateFromMid (15th of month1Ago) → visible
    const month0Bucket = result.data.find((d) => d.bucket.startsWith(month0));
    expect(month0Bucket).toBeDefined();
    // returningUser was active in month1Ago (prevBucket of month0) → returning
    expect(month0Bucket!.returning).toBe(1);
    // newUser has no prior history → new
    expect(month0Bucket!.new).toBe(1);
  });
});
