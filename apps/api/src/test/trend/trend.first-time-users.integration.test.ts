import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryTrend } from '../../analytics/trend/trend.query';
import { sumSeriesValues } from '../helpers';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryTrend — first_time_users', () => {
  it('counts only users whose first event is within the analysis window', async () => {
    const projectId = randomUUID();
    const existingUser = randomUUID();
    const newUser = randomUUID();

    // existingUser has an event BEFORE the analysis window (10 days ago)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: existingUser,
        distinct_id: 'existing',
        event_name: 'page_view',
        timestamp: ts(10, 12),
      }),
    ]);

    // Both users have events IN the analysis window (3 days ago)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: existingUser,
        distinct_id: 'existing',
        event_name: 'page_view',
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new',
        event_name: 'page_view',
        timestamp: ts(3, 14),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'First-time Views', metric: 'first_time_users' }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    // Only newUser should be counted — existingUser had events before dateFrom
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('handles multiple first-time users across different days', async () => {
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const userC = randomUUID();

    // userA: first event 5 days ago
    // userB: first event 4 days ago
    // userC: first event 4 days ago (same day as userB)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'signup', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: userB, distinct_id: 'b', event_name: 'signup', timestamp: ts(4, 10) }),
      buildEvent({ project_id: projectId, person_id: userC, distinct_id: 'c', event_name: 'signup', timestamp: ts(4, 14) }),
      // userA has a repeat event — should not be double-counted
      buildEvent({ project_id: projectId, person_id: userA, distinct_id: 'a', event_name: 'signup', timestamp: ts(4, 16) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'signup', label: 'First-time Signups', metric: 'first_time_users' }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    // 3 new users total
    expect(sumSeriesValues(r.series[0].data)).toBe(3);

    // Verify distribution: 1 user on day 5 ago, 2 users on day 4 ago
    const sorted = [...r.series[0].data].sort((a, b) => a.bucket.localeCompare(b.bucket));
    expect(sorted[0].value).toBe(1); // day 5 ago (userA)
    expect(sorted[1].value).toBe(2); // day 4 ago (userB + userC)
  });

  it('returns 0 when all users have prior history', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    // User has events before the analysis window
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: user, distinct_id: 'u', event_name: 'click', timestamp: ts(20, 10) }),
      // And events during the analysis window
      buildEvent({ project_id: projectId, person_id: user, distinct_id: 'u', event_name: 'click', timestamp: ts(3, 10) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'First-time Clicks', metric: 'first_time_users' }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r.series[0].data)).toBe(0);
  });

  it('works with compare mode', async () => {
    const projectId = randomUUID();
    const user1 = randomUUID();
    const user2 = randomUUID();

    // user1: first event 4 days ago (current period)
    // user2: first event 8 days ago (previous period)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: user1, distinct_id: 'u1', event_name: 'visit', timestamp: ts(4, 10) }),
      buildEvent({ project_id: projectId, person_id: user2, distinct_id: 'u2', event_name: 'visit', timestamp: ts(8, 10) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'visit', label: 'First-time Visits', metric: 'first_time_users' }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
      compare: true,
    });

    expect(result.compare).toBe(true);
    const r = result as Extract<typeof result, { compare: true }>;
    // Current period: user1 is a first-time user
    const currentTotal = sumSeriesValues(r.series[0]?.data ?? []);
    expect(currentTotal).toBe(1);
    // Previous period: user2 is a first-time user
    const prevTotal = sumSeriesValues(r.series_previous[0]?.data ?? []);
    expect(prevTotal).toBe(1);
  });

  it('rejects first_time_users + cohort breakdown', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();

    await expect(
      queryTrend(ctx.ch, {
        project_id: projectId,
        series: [{ event_name: 'click', label: 'Clicks', metric: 'first_time_users' }],
        granularity: 'day',
        date_from: daysAgo(5),
        date_to: daysAgo(3),
        timezone: 'UTC',
        breakdown_cohort_ids: [{ cohort_id: cohortId, name: 'Test Cohort', is_static: false, materialized: false, definition: { type: 'AND', values: [] } }],
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('works with property breakdown using argMin', async () => {
    const projectId = randomUUID();
    const userChrome = randomUUID();
    const userFirefox = randomUUID();

    // Both users are new — their first events have different browsers
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: userChrome,
        distinct_id: 'chrome',
        event_name: 'page_view',
        browser: 'Chrome',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userFirefox,
        distinct_id: 'firefox',
        event_name: 'page_view',
        browser: 'Firefox',
        timestamp: ts(3, 12),
      }),
      // userChrome has a second event with different browser — should use first event's browser
      buildEvent({
        project_id: projectId,
        person_id: userChrome,
        distinct_id: 'chrome',
        event_name: 'page_view',
        browser: 'Safari',
        timestamp: ts(3, 14),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'First-time Views', metric: 'first_time_users' }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    // Should have 2 breakdown groups: Chrome and Firefox (not Safari — argMin uses first event)
    const chromeGroup = r.series.find((s) => s.breakdown_value === 'Chrome');
    const firefoxGroup = r.series.find((s) => s.breakdown_value === 'Firefox');
    expect(chromeGroup).toBeDefined();
    expect(firefoxGroup).toBeDefined();
    expect(sumSeriesValues(chromeGroup!.data)).toBe(1);
    expect(sumSeriesValues(firefoxGroup!.data)).toBe(1);

    // Safari should NOT appear since userChrome's first event was Chrome
    const safariGroup = r.series.find((s) => s.breakdown_value === 'Safari');
    expect(safariGroup).toBeUndefined();
  });
});
