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

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryTrend — total_events', () => {
  it('counts events per day bucket', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'page_view', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'page_view', timestamp: ts(3, 14) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'page_view', timestamp: ts(2, 14) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Page Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    const total = sumSeriesValues(r.series[0].data);
    expect(total).toBe(3);
    // Should have 2 buckets (day1: 2, day2: 1)
    expect(r.series[0].data).toHaveLength(2);
    const sorted = [...r.series[0].data].sort((a, b) => b.value - a.value);
    expect(sorted[0].value).toBe(2);
    expect(sorted[1].value).toBe(1);
  });

  it('handles multiple series', async () => {
    const projectId = randomUUID();
    const day = ts(3, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', timestamp: day }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', timestamp: day }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'purchase', timestamp: day }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [
        { event_name: 'click', label: 'Clicks' },
        { event_name: 'purchase', label: 'Purchases' },
      ],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r2 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r2.series).toHaveLength(2);
    const clicks = r2.series.find((s) => s.series_idx === 0);
    const purchases = r2.series.find((s) => s.series_idx === 1);
    expect(sumSeriesValues(clicks!.data)).toBe(2);
    expect(sumSeriesValues(purchases!.data)).toBe(1);
  });
});

describe('queryTrend — unique_users', () => {
  it('deduplicates by person_id within a bucket', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: 'anon-1',
        event_name: 'click',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: 'user-1',
        event_name: 'click',
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'unique_users',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r3 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r3.series[0].data)).toBe(1);
  });
});

describe('queryTrend — events_per_user', () => {
  it('calculates ratio of total events to unique users', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: 3 clicks, personB: 1 click → 4/2 = 2.0
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 11) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'click', timestamp: ts(3, 10) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'events_per_user',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r4 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r4.series[0].data)).toBe(2);
  });
});

describe('queryTrend — empty result', () => {
  it('returns empty series when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'nonexistent_event_xyz', label: 'None' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    expect(sumSeriesValues(r.series[0].data)).toBe(0);
  });
});

describe('queryTrend — week granularity', () => {
  it('buckets events by week (Monday-aligned) and returns correct counts per week', async () => {
    const projectId = randomUUID();

    // Spread events across two distinct weeks.
    // Week A: events 10 and 11 days ago (both fall in the same Monday-aligned week).
    // Week B: events 17 and 18 days ago (one week earlier).
    // date_from = 18 days ago, date_to = 10 days ago → covers both weeks.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'visit', timestamp: ts(10, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'visit', timestamp: ts(11, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'visit', timestamp: ts(17, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u4', event_name: 'visit', timestamp: ts(18, 10) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'visit', label: 'Visits' }],
      metric: 'total_events',
      granularity: 'week',
      date_from: daysAgo(18),
      date_to: daysAgo(10),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);

    // Total should be 4 events
    expect(sumSeriesValues(r.series[0].data)).toBe(4);

    // All bucket timestamps should start on a Monday (weekday = 1 when parsed as UTC)
    for (const point of r.series[0].data) {
      const bucketDate = new Date(point.bucket.replace(' ', 'T') + 'Z');
      expect(bucketDate.getUTCDay()).toBe(1); // 1 = Monday
    }
  });
});

describe('queryTrend — month granularity', () => {
  it('buckets events by month and returns correct counts per month', async () => {
    const projectId = randomUUID();

    // Spread events across two distinct months.
    // "this month" events: 5 and 10 days ago.
    // "last month" events: 35 and 40 days ago (guaranteed to be a different calendar month).
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'action', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'action', timestamp: ts(10, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'action', timestamp: ts(35, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u4', event_name: 'action', timestamp: ts(40, 10) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'action', label: 'Actions' }],
      metric: 'total_events',
      granularity: 'month',
      date_from: daysAgo(40),
      date_to: daysAgo(5),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);

    // Total should be 4 events
    expect(sumSeriesValues(r.series[0].data)).toBe(4);

    // All bucket timestamps should be on the 1st day of the month
    for (const point of r.series[0].data) {
      const bucketDate = new Date(point.bucket.replace(' ', 'T') + 'Z');
      expect(bucketDate.getUTCDate()).toBe(1);
    }
  });
});
