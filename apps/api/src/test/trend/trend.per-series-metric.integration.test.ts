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

describe('queryTrend — per-series metric', () => {
  it('supports different metrics in the same query', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: 3 events, personB: 1 event → total=4, unique=2
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 11) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'click', timestamp: ts(3, 13) }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [
        { event_name: 'click', label: 'Total Clicks', metric: 'total_events' },
        { event_name: 'click', label: 'Unique Clickers', metric: 'unique_users' },
      ],
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(2);

    const totalSeries = r.series.find((s) => s.series_idx === 0);
    const uniqueSeries = r.series.find((s) => s.series_idx === 1);

    // Series 0 uses total_events metric → 4
    expect(sumSeriesValues(totalSeries!.data)).toBe(4);
    // Series 1 uses unique_users metric → 2
    expect(sumSeriesValues(uniqueSeries!.data)).toBe(2);
  });

  it('mixes regular and first_time_users metrics', async () => {
    const projectId = randomUUID();
    const existingUser = randomUUID();
    const newUser = randomUUID();

    // existingUser has prior history
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: existingUser,
        distinct_id: 'existing',
        event_name: 'page_view',
        timestamp: ts(20, 10),
      }),
    ]);

    // Both users have events in the analysis window
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: existingUser,
        distinct_id: 'existing',
        event_name: 'page_view',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new',
        event_name: 'page_view',
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [
        { event_name: 'page_view', label: 'Total Events', metric: 'total_events' },
        { event_name: 'page_view', label: 'First-time Users', metric: 'first_time_users' },
      ],
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(2);

    const totalSeries = r.series.find((s) => s.series_idx === 0);
    const firstTimeSeries = r.series.find((s) => s.series_idx === 1);

    // total_events: both events in the window
    expect(sumSeriesValues(totalSeries!.data)).toBe(2);
    // first_time_users: only newUser
    expect(sumSeriesValues(firstTimeSeries!.data)).toBe(1);
  });
});
