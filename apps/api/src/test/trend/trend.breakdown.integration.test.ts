import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import { getTestContext } from '../context';
import { queryTrend } from '../../analytics/trend/trend.query';
import { sumSeriesValues } from '../helpers';
import type { CohortFilterInput } from '@qurvo/cohort-query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryTrend — with breakdown', () => {
  it('segments by breakdown property', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', browser: 'Chrome', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', browser: 'Chrome', timestamp: ts(3, 11) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'click', browser: 'Safari', timestamp: ts(3, 10) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    const chromeResult = rBd.series.find((s) => s.breakdown_value === 'Chrome');
    const safariResult = rBd.series.find((s) => s.breakdown_value === 'Safari');
    expect(sumSeriesValues(chromeResult!.data)).toBe(2);
    expect(sumSeriesValues(safariResult!.data)).toBe(1);
  });
});

describe('queryTrend — breakdown + cohort filter', () => {
  it('top_values CTE respects cohort filter — excludes breakdown values from users outside the cohort', async () => {
    const projectId = randomUUID();

    // Premium users use 'Chrome' — they are in the cohort
    const premiumUser1 = randomUUID();
    const premiumUser2 = randomUUID();
    // Free users use 'Safari' — they are NOT in the cohort
    // Insert many Safari events so Safari would dominate the top without the filter
    const freeUser1 = randomUUID();
    const freeUser2 = randomUUID();
    const freeUser3 = randomUUID();

    await insertTestEvents(ctx.ch, [
      // 2 premium users: Chrome
      buildEvent({
        project_id: projectId,
        person_id: premiumUser1,
        distinct_id: 'premium1',
        event_name: 'pageview',
        browser: 'Chrome',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser2,
        distinct_id: 'premium2',
        event_name: 'pageview',
        browser: 'Chrome',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(4000),
      }),
      // 3 free users: Safari (more events than Chrome users, would dominate top without cohort filter)
      buildEvent({
        project_id: projectId,
        person_id: freeUser1,
        distinct_id: 'free1',
        event_name: 'pageview',
        browser: 'Safari',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser2,
        distinct_id: 'free2',
        event_name: 'pageview',
        browser: 'Safari',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser3,
        distinct_id: 'free3',
        event_name: 'pageview',
        browser: 'Safari',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
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

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'pageview', label: 'Pageviews' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(1),
      date_to: daysAgo(0),
      breakdown_property: 'browser',
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // Only Chrome should appear — Safari users are outside the cohort
    const chromeResult = rBd.series.find((s) => s.breakdown_value === 'Chrome');
    const safariResult = rBd.series.find((s) => s.breakdown_value === 'Safari');

    expect(chromeResult).toBeDefined();
    expect(sumSeriesValues(chromeResult!.data)).toBe(2);
    // Safari must NOT appear even though it has more raw events — it's filtered out by cohort
    expect(safariResult).toBeUndefined();
  });
});

describe('queryTrend — breakdown + compare combined', () => {
  it('returns breakdown series for both current and previous periods', async () => {
    const projectId = randomUUID();

    // Current period: daysAgo(4) to daysAgo(3)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', browser: 'Chrome', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', browser: 'Safari', timestamp: ts(4, 12) }),
    ]);

    // Previous period: daysAgo(6) to daysAgo(5) (shifted back by 2-day period duration)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'click', browser: 'Chrome', timestamp: ts(6, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u4', event_name: 'click', browser: 'Firefox', timestamp: ts(5, 12) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(4),
      date_to: daysAgo(3),
      breakdown_property: 'browser',
      compare: true,
    });

    expect(result.compare).toBe(true);
    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { compare: true; breakdown: true }>;

    // Current period should have Chrome and Safari
    expect(r.series.length).toBeGreaterThanOrEqual(2);
    const currentChrome = r.series.find((s) => s.breakdown_value === 'Chrome');
    const currentSafari = r.series.find((s) => s.breakdown_value === 'Safari');
    expect(currentChrome).toBeDefined();
    expect(currentSafari).toBeDefined();
    expect(sumSeriesValues(currentChrome!.data)).toBe(1);
    expect(sumSeriesValues(currentSafari!.data)).toBe(1);

    // Previous period should have Chrome and Firefox
    expect(r.series_previous.length).toBeGreaterThanOrEqual(2);
    const prevChrome = r.series_previous.find((s) => s.breakdown_value === 'Chrome');
    const prevFirefox = r.series_previous.find((s) => s.breakdown_value === 'Firefox');
    expect(prevChrome).toBeDefined();
    expect(prevFirefox).toBeDefined();
    expect(sumSeriesValues(prevChrome!.data)).toBe(1);
    expect(sumSeriesValues(prevFirefox!.data)).toBe(1);
  });
});
