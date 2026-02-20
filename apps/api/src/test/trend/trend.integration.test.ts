import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@shot/testing';
import { queryTrend } from '../../trend/trend.query';
import { sumSeriesValues } from '../helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
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
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    if (!result.compare && !result.breakdown) {
      expect(result.series).toHaveLength(1);
      const total = sumSeriesValues(result.series[0].data);
      expect(total).toBe(3);
      // Should have 2 buckets (day1: 2, day2: 1)
      expect(result.series[0].data).toHaveLength(2);
      const sorted = [...result.series[0].data].sort((a, b) => b.value - a.value);
      expect(sorted[0].value).toBe(2);
      expect(sorted[1].value).toBe(1);
    }
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
    });

    if (!result.compare && !result.breakdown) {
      expect(result.series).toHaveLength(2);
      const clicks = result.series.find((s) => s.series_idx === 0);
      const purchases = result.series.find((s) => s.series_idx === 1);
      expect(sumSeriesValues(clicks!.data)).toBe(2);
      expect(sumSeriesValues(purchases!.data)).toBe(1);
    }
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
    });

    if (!result.compare && !result.breakdown) {
      expect(sumSeriesValues(result.series[0].data)).toBe(1);
    }
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
    });

    if (!result.compare && !result.breakdown) {
      expect(sumSeriesValues(result.series[0].data)).toBe(2);
    }
  });
});

describe('queryTrend — compare mode', () => {
  it('returns current and previous period series', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Current period: daysAgo(4) to daysAgo(3)
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'visit', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'visit', timestamp: ts(4, 12) }),
      // Previous period: daysAgo(6) to daysAgo(5) (shifted back by period duration)
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'visit', timestamp: ts(6, 12) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'visit', label: 'Visits' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(4),
      date_to: daysAgo(3),
      compare: true,
    });

    expect(result.compare).toBe(true);
    if (result.compare) {
      expect(result.series).toBeDefined();
      expect(result.series_previous).toBeDefined();
      const currentTotal = sumSeriesValues(result.series[0]?.data ?? []);
      expect(currentTotal).toBe(2);
      const prevTotal = sumSeriesValues(result.series_previous[0]?.data ?? []);
      expect(prevTotal).toBe(1);
    }
  });
});

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
    if (result.breakdown) {
      const chromeResult = result.series.find((s) => s.breakdown_value === 'Chrome');
      const safariResult = result.series.find((s) => s.breakdown_value === 'Safari');
      expect(sumSeriesValues(chromeResult!.data)).toBe(2);
      expect(sumSeriesValues(safariResult!.data)).toBe(1);
    }
  });
});

describe('queryTrend — with series filters', () => {
  it('applies filters on event properties', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 10),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'Premium Purchases',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'premium' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    if (!result.compare && !result.breakdown) {
      expect(sumSeriesValues(result.series[0].data)).toBe(1);
    }
  });
});
