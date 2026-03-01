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

describe('queryTrend — hour granularity', () => {
  it('buckets events by hour and returns correct counts per hour bucket', async () => {
    const projectId = randomUUID();

    // Insert 3 events on the same day but at different hours:
    //   hour 10 → 2 events
    //   hour 14 → 1 event
    // Use ts(1, ...) to place events yesterday so they are safely within
    // date_from = daysAgo(1) ... date_to = daysAgo(1).
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', timestamp: ts(1, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', timestamp: ts(1, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'click', timestamp: ts(1, 14) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'hour',
      date_from: daysAgo(1),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);

    // Total across all buckets should be 3
    expect(sumSeriesValues(r.series[0].data)).toBe(3);

    // Two distinct hours → two buckets
    expect(r.series[0].data).toHaveLength(2);

    // Sort by value descending: bucket with 2 events first, then bucket with 1
    const sorted = [...r.series[0].data].sort((a, b) => b.value - a.value);
    expect(sorted[0].value).toBe(2);
    expect(sorted[1].value).toBe(1);
  });

  it('bucket timestamps are truncated to the start of each hour', async () => {
    const projectId = randomUUID();

    // Insert events at two distinct hours 2 days ago (hour 08 and hour 20)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'visit', timestamp: ts(2, 8) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'visit', timestamp: ts(2, 20) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'visit', label: 'Visits' }],
      metric: 'total_events',
      granularity: 'hour',
      date_from: daysAgo(2),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    expect(r.series[0].data).toHaveLength(2);

    // Each bucket timestamp must have minutes = 0 and seconds = 0
    // (i.e. truncated to the start of the hour).
    for (const point of r.series[0].data) {
      // ClickHouse returns DateTime as "YYYY-MM-DD HH:MM:SS"
      const parts = point.bucket.split(' ');
      expect(parts).toHaveLength(2);
      const timePart = parts[1]; // "HH:MM:SS"
      const [, mm, ss] = timePart.split(':');
      expect(mm).toBe('00');
      expect(ss).toBe('00');
    }
  });

  it('counts unique users per hour bucket (unique_users metric)', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    // Same person fires 3 events within hour 9 (should count as 1 unique)
    // Another person fires 1 event in hour 15 (should count as 1 unique)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personId, distinct_id: 'p1', event_name: 'action', timestamp: ts(1, 9) }),
      buildEvent({ project_id: projectId, person_id: personId, distinct_id: 'p1', event_name: 'action', timestamp: ts(1, 9) }),
      buildEvent({ project_id: projectId, person_id: personId, distinct_id: 'p1', event_name: 'action', timestamp: ts(1, 9) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'p2', event_name: 'action', timestamp: ts(1, 15) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'action', label: 'Actions' }],
      metric: 'unique_users',
      granularity: 'hour',
      date_from: daysAgo(1),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);

    // 2 buckets, each with 1 unique user
    expect(r.series[0].data).toHaveLength(2);
    expect(sumSeriesValues(r.series[0].data)).toBe(2);
    for (const point of r.series[0].data) {
      expect(point.value).toBe(1);
    }
  });
});
