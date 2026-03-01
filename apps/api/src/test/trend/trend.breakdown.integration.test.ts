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

describe('queryTrend — breakdown + per-series filters', () => {
  it('top_values only considers events matching series filters — no zero-value breakdown slots', async () => {
    const projectId = randomUUID();

    // series[0] filters plan = 'pro' → only 'Chrome' events satisfy this
    // series[1] filters plan = 'free' → only 'Firefox' events satisfy this
    // Insert many 'Safari' events with plan = 'trial' — they should NOT appear
    // in the top_values for either series even though they are the most frequent.

    await insertTestEvents(ctx.ch, [
      // 3 pro/Chrome events — more than Firefox to ensure Chrome ranks higher in top_values
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'pro1', event_name: 'signup',
        browser: 'Chrome', properties: JSON.stringify({ plan: 'pro' }), timestamp: msAgo(5000) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'pro2', event_name: 'signup',
        browser: 'Chrome', properties: JSON.stringify({ plan: 'pro' }), timestamp: msAgo(4900) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'pro3', event_name: 'signup',
        browser: 'Chrome', properties: JSON.stringify({ plan: 'pro' }), timestamp: msAgo(4800) }),
      // 2 free/Firefox events — different count from Chrome to avoid tied top_values ordering
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'free1', event_name: 'signup',
        browser: 'Firefox', properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(4000) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'free2', event_name: 'signup',
        browser: 'Firefox', properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3900) }),
      // 5 trial/Safari events — most frequent, but unrelated to either series filter
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'trial1', event_name: 'signup',
        browser: 'Safari', properties: JSON.stringify({ plan: 'trial' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'trial2', event_name: 'signup',
        browser: 'Safari', properties: JSON.stringify({ plan: 'trial' }), timestamp: msAgo(2900) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'trial3', event_name: 'signup',
        browser: 'Safari', properties: JSON.stringify({ plan: 'trial' }), timestamp: msAgo(2800) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'trial4', event_name: 'signup',
        browser: 'Safari', properties: JSON.stringify({ plan: 'trial' }), timestamp: msAgo(2700) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'trial5', event_name: 'signup',
        browser: 'Safari', properties: JSON.stringify({ plan: 'trial' }), timestamp: msAgo(2600) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [
        {
          event_name: 'signup',
          label: 'Pro signups',
          filters: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
        },
        {
          event_name: 'signup',
          label: 'Free signups',
          filters: [{ property: 'properties.plan', operator: 'eq', value: 'free' }],
        },
      ],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(1),
      date_to: daysAgo(0),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // series[0] (pro): only Chrome should appear with value 3
    const s0Chrome = rBd.series.find((s) => s.series_idx === 0 && s.breakdown_value === 'Chrome');
    const s0Safari = rBd.series.find((s) => s.series_idx === 0 && s.breakdown_value === 'Safari');
    const s0Firefox = rBd.series.find((s) => s.series_idx === 0 && s.breakdown_value === 'Firefox');
    expect(s0Chrome).toBeDefined();
    expect(sumSeriesValues(s0Chrome!.data)).toBe(3);
    // Safari must NOT appear in series[0] — it only has trial events, not pro
    expect(s0Safari).toBeUndefined();
    expect(s0Firefox).toBeUndefined();

    // series[1] (free): only Firefox should appear with value 2
    const s1Firefox = rBd.series.find((s) => s.series_idx === 1 && s.breakdown_value === 'Firefox');
    const s1Safari = rBd.series.find((s) => s.series_idx === 1 && s.breakdown_value === 'Safari');
    const s1Chrome = rBd.series.find((s) => s.series_idx === 1 && s.breakdown_value === 'Chrome');
    expect(s1Firefox).toBeDefined();
    expect(sumSeriesValues(s1Firefox!.data)).toBe(2);
    // Safari must NOT appear in series[1] — trial events don't match plan = 'free'
    expect(s1Safari).toBeUndefined();
    expect(s1Chrome).toBeUndefined();
  });
});

describe('queryTrend — breakdown + compare combined', () => {
  it('returns breakdown series for both current and previous periods — only current-period top-N values', async () => {
    const projectId = randomUUID();

    // Current period: daysAgo(4) to daysAgo(3)
    // Chrome and Safari appear in the current period (these become the fixed top-N).
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', browser: 'Chrome', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', browser: 'Safari', timestamp: ts(4, 12) }),
    ]);

    // Previous period: daysAgo(6) to daysAgo(5) (shifted back by 2-day period duration).
    // Chrome is present in both periods; Firefox is ONLY in the previous period.
    // After the fix, Firefox must NOT appear in series_previous because it is not in
    // the current-period top-N (Chrome and Safari).
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

    // Previous period: Chrome=1 (present in both periods), Safari=0 (gap-filled),
    // Firefox must NOT appear (it is not in the current-period top-N).
    const prevChrome = r.series_previous.find((s) => s.breakdown_value === 'Chrome');
    const prevSafari = r.series_previous.find((s) => s.breakdown_value === 'Safari');
    const prevFirefox = r.series_previous.find((s) => s.breakdown_value === 'Firefox');
    expect(prevChrome).toBeDefined();
    expect(sumSeriesValues(prevChrome!.data)).toBe(1);
    expect(prevSafari).toBeDefined();           // gap-filled with empty data
    expect(sumSeriesValues(prevSafari!.data)).toBe(0);
    expect(prevFirefox).toBeUndefined();         // excluded: not in current-period top-N
  });
});

describe('queryTrend — compare + breakdown: previous period uses current-period top-N', () => {
  it('previous period contains all breakdown values from current period (even if count=0)', async () => {
    const projectId = randomUUID();

    // Current period: daysAgo(4) to daysAgo(3)
    // Chrome (2 events) and Safari (1 event) are top values in current period
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'c1', event_name: 'page', browser: 'Chrome', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'c2', event_name: 'page', browser: 'Chrome', timestamp: ts(4, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'c3', event_name: 'page', browser: 'Safari', timestamp: ts(3, 11) }),
    ]);

    // Previous period: daysAgo(6) to daysAgo(5)
    // Only Firefox events — Chrome and Safari are absent from previous period.
    // Before the fix: previous-period top-N would contain only Firefox, so Chrome/Safari
    // would be missing from series_previous.
    // After the fix: previous-period uses current-period top-N (Chrome, Safari), so
    // both appear in series_previous with count=0.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'p1', event_name: 'page', browser: 'Firefox', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'p2', event_name: 'page', browser: 'Firefox', timestamp: ts(6, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'p3', event_name: 'page', browser: 'Firefox', timestamp: ts(6, 11) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page', label: 'Pages' }],
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

    // Current period: Chrome=2, Safari=1
    const currentChrome = r.series.find((s) => s.breakdown_value === 'Chrome');
    const currentSafari = r.series.find((s) => s.breakdown_value === 'Safari');
    expect(currentChrome).toBeDefined();
    expect(currentSafari).toBeDefined();
    expect(sumSeriesValues(currentChrome!.data)).toBe(2);
    expect(sumSeriesValues(currentSafari!.data)).toBe(1);

    // Collect the breakdown values present in current period
    const currentBreakdownValues = new Set(r.series.map((s) => s.breakdown_value));
    // Collect the breakdown values present in previous period
    const prevBreakdownValues = new Set(r.series_previous.map((s) => s.breakdown_value));

    // Every value from the current period must be present in the previous period
    // (the acceptance criterion from the issue).  Chrome and Safari must appear
    // in series_previous even though the previous-period data only has Firefox.
    for (const bv of currentBreakdownValues) {
      expect(prevBreakdownValues).toContain(bv);
    }

    // Chrome and Safari appear in series_previous with count=0 (no data in previous period)
    const prevChrome = r.series_previous.find((s) => s.breakdown_value === 'Chrome');
    const prevSafari = r.series_previous.find((s) => s.breakdown_value === 'Safari');
    expect(prevChrome).toBeDefined();
    expect(sumSeriesValues(prevChrome!.data)).toBe(0);
    expect(prevSafari).toBeDefined();
    expect(sumSeriesValues(prevSafari!.data)).toBe(0);

    // Firefox should NOT appear in previous period — it is not in the current-period top-N
    const prevFirefox = r.series_previous.find((s) => s.breakdown_value === 'Firefox');
    expect(prevFirefox).toBeUndefined();
  });
});

describe('queryTrend — breakdown empty string vs null', () => {
  it('empty string breakdown_value maps to (none), not a separate group', async () => {
    // JSONExtractString returns '' both when the key is missing (null-like)
    // and when the property is explicitly set to ''.
    // Before the fix: both mapped to '(none)' via || operator — but '' was falsy.
    // After the fix: both map to '(none)' explicitly via != null && !== '' check.
    // This test verifies the non-empty breakdown_value 'premium' is a distinct group.
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      // User with explicit non-empty plan property → should form 'premium' group
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u-premium',
        event_name: 'pageview',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      // User without plan property → JSONExtractString returns '' → maps to '(none)'
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u-no-plan',
        event_name: 'pageview',
        properties: JSON.stringify({}),
        timestamp: msAgo(4000),
      }),
      // Another user without plan property
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u-no-plan-2',
        event_name: 'pageview',
        properties: JSON.stringify({}),
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'pageview', label: 'Pageviews' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(1),
      date_to: daysAgo(0),
      breakdown_property: 'properties.plan',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // 'premium' group must exist with count 1
    const premiumSeries = rBd.series.find((s) => s.breakdown_value === 'premium');
    expect(premiumSeries).toBeDefined();
    expect(sumSeriesValues(premiumSeries!.data)).toBe(1);

    // '(none)' group should contain the 2 users without plan property (empty string from ClickHouse)
    const noneSeries = rBd.series.find((s) => s.breakdown_value === '(none)');
    expect(noneSeries).toBeDefined();
    expect(sumSeriesValues(noneSeries!.data)).toBe(2);

    // No group with breakdown_value === '' should exist
    const emptyStringSeries = rBd.series.find((s) => s.breakdown_value === '');
    expect(emptyStringSeries).toBeUndefined();
  });
});
