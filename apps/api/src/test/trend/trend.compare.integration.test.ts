import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { queryTrend } from '../../analytics/trend/trend.query';
import { sumSeriesValues } from '../helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
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
  });
});
