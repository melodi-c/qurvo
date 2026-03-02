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

describe('queryTrend — first_matching_event', () => {
  it('includes user whose prior event lacks the series filter (excluded by first_time_users)', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    // User purchased "basic" 10 days ago (before analysis window)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'u',
        event_name: 'purchase',
        timestamp: ts(10, 12),
        properties: JSON.stringify({ plan: 'basic' }),
      }),
    ]);

    // User purchased "pro" 3 days ago (inside analysis window)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'u',
        event_name: 'purchase',
        timestamp: ts(3, 12),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
    ]);

    // first_time_users: user is EXCLUDED (prior "purchase" event exists regardless of filters)
    const ftuResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'FTU',
        metric: 'first_time_users',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });
    const ftuR = ftuResult as Extract<typeof ftuResult, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(ftuR.series[0].data)).toBe(0);

    // first_matching_event: user is INCLUDED (no prior "purchase" with plan=pro)
    const fmeResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'FME',
        metric: 'first_matching_event',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });
    const fmeR = fmeResult as Extract<typeof fmeResult, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(fmeR.series[0].data)).toBe(1);
  });

  it('excludes user whose prior event matches the series filter', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    // User purchased "pro" 10 days ago AND 3 days ago
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'u',
        event_name: 'purchase',
        timestamp: ts(10, 12),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'u',
        event_name: 'purchase',
        timestamp: ts(3, 12),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'FME',
        metric: 'first_matching_event',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // User had prior matching event — excluded
    expect(sumSeriesValues(r.series[0].data)).toBe(0);
  });

  it('includes user with no prior events at all', async () => {
    const projectId = randomUUID();
    const newUser = randomUUID();

    // New user's first-ever event is inside the analysis window
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new',
        event_name: 'purchase',
        timestamp: ts(3, 14),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'FME',
        metric: 'first_matching_event',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // New user — included in both first_time_users and first_matching_event
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('behaves like first_time_users when series has no filters', async () => {
    const projectId = randomUUID();
    const existingUser = randomUUID();
    const newUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      // existingUser has an event BEFORE the analysis window
      buildEvent({
        project_id: projectId,
        person_id: existingUser,
        distinct_id: 'existing',
        event_name: 'page_view',
        timestamp: ts(10, 12),
      }),
      // Both have events IN the analysis window
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

    // first_matching_event without filters = identical to first_time_users
    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'FME no filter', metric: 'first_matching_event' }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('works with property breakdown', async () => {
    const projectId = randomUUID();
    const userChrome = randomUUID();
    const userFirefox = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: userChrome,
        distinct_id: 'chrome',
        event_name: 'purchase',
        timestamp: ts(3, 10),
        properties: JSON.stringify({ plan: 'pro' }),
        browser: 'Chrome',
      }),
      buildEvent({
        project_id: projectId,
        person_id: userFirefox,
        distinct_id: 'firefox',
        event_name: 'purchase',
        timestamp: ts(3, 12),
        properties: JSON.stringify({ plan: 'pro' }),
        browser: 'Firefox',
      }),
      // userChrome has a second event with different browser — argMin should use first event
      buildEvent({
        project_id: projectId,
        person_id: userChrome,
        distinct_id: 'chrome',
        event_name: 'purchase',
        timestamp: ts(3, 14),
        properties: JSON.stringify({ plan: 'pro' }),
        browser: 'Safari',
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'FME',
        metric: 'first_matching_event',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    const chromeGroup = r.series.find((s) => s.breakdown_value === 'Chrome');
    const firefoxGroup = r.series.find((s) => s.breakdown_value === 'Firefox');
    expect(chromeGroup).toBeDefined();
    expect(firefoxGroup).toBeDefined();
    expect(sumSeriesValues(chromeGroup!.data)).toBe(1);
    expect(sumSeriesValues(firefoxGroup!.data)).toBe(1);

    // Safari should NOT appear — argMin uses first event's browser
    const safariGroup = r.series.find((s) => s.breakdown_value === 'Safari');
    expect(safariGroup).toBeUndefined();
  });

  it('works with compare mode', async () => {
    const projectId = randomUUID();
    const user1 = randomUUID();
    const user2 = randomUUID();

    // user1: first matching event 4 days ago (current period)
    // user2: first matching event 8 days ago (previous period)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user1,
        distinct_id: 'u1',
        event_name: 'purchase',
        timestamp: ts(4, 10),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: user2,
        distinct_id: 'u2',
        event_name: 'purchase',
        timestamp: ts(8, 10),
        properties: JSON.stringify({ plan: 'pro' }),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'FME',
        metric: 'first_matching_event',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      }],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
      compare: true,
    });

    expect(result.compare).toBe(true);
    const r = result as Extract<typeof result, { compare: true }>;

    const currentTotal = sumSeriesValues(r.series[0]?.data ?? []);
    expect(currentTotal).toBe(1);
    const prevTotal = sumSeriesValues(r.series_previous[0]?.data ?? []);
    expect(prevTotal).toBe(1);
  });

  it('rejects first_matching_event + cohort breakdown', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();

    await expect(
      queryTrend(ctx.ch, {
        project_id: projectId,
        series: [{ event_name: 'click', label: 'FME', metric: 'first_matching_event' }],
        granularity: 'day',
        date_from: daysAgo(5),
        date_to: daysAgo(3),
        timezone: 'UTC',
        breakdown_cohort_ids: [{ cohort_id: cohortId, name: 'Test Cohort', is_static: false, materialized: false, definition: { type: 'AND', values: [] } }],
      }),
    ).rejects.toThrow(AppBadRequestException);
  });
});
