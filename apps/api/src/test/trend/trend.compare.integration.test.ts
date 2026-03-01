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
      timezone: 'UTC',
      compare: true,
    });

    expect(result.compare).toBe(true);
    const r = result as Extract<typeof result, { compare: true }>;
    expect(r.series).toBeDefined();
    expect(r.series_previous).toBeDefined();
    const currentTotal = sumSeriesValues(r.series[0]?.data ?? []);
    expect(currentTotal).toBe(2);
    const prevTotal = sumSeriesValues(r.series_previous[0]?.data ?? []);
    expect(prevTotal).toBe(1);

    // Verify bucket timestamps: current period covers daysAgo(4)..daysAgo(3),
    // previous period (shifted back by 2 days) covers daysAgo(6)..daysAgo(5).
    // Bucket dates must differ between current and previous series so that a
    // bug in shiftPeriod (returning same offset) would cause an assertion failure.
    const currentBuckets = r.series[0].data.map((d) => d.bucket);
    const previousBuckets = r.series_previous[0].data.map((d) => d.bucket);
    expect(currentBuckets.length).toBeGreaterThan(0);
    expect(previousBuckets.length).toBeGreaterThan(0);
    // None of the current-period bucket dates should be present in the previous-period buckets
    for (const cb of currentBuckets) {
      expect(previousBuckets).not.toContain(cb);
    }
    // Current buckets should contain daysAgo(3) and daysAgo(4)
    expect(currentBuckets.some((b) => b.startsWith(daysAgo(3)))).toBe(true);
    expect(currentBuckets.some((b) => b.startsWith(daysAgo(4)))).toBe(true);
    // Previous buckets should contain daysAgo(6) (the one event in the previous period)
    expect(previousBuckets.some((b) => b.startsWith(daysAgo(6)))).toBe(true);
  });
});
