import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryTrendAggregate } from '../../analytics/trend/trend-aggregate.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryTrendAggregate — world_map', () => {
  it('groups events by country', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'page_view', timestamp: ts(3, 12), country: 'US' }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'page_view', timestamp: ts(3, 14), country: 'US' }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'page_view', timestamp: ts(2, 10), country: 'DE' }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u4', event_name: 'page_view', timestamp: ts(2, 11), country: 'FR' }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u5', event_name: 'page_view', timestamp: ts(2, 15), country: 'FR' }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u6', event_name: 'page_view', timestamp: ts(2, 16), country: 'FR' }),
    ]);

    const result = await queryTrendAggregate(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Page Views' }],
      aggregate_type: 'world_map',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    expect(result.type).toBe('world_map');
    if (result.type !== 'world_map') {throw new Error('unexpected type');}

    expect(result.world_map.length).toBeGreaterThanOrEqual(3);

    // Sorted by value DESC — FR should be first (3), then US (2), then DE (1)
    const fr = result.world_map.find((r) => r.country === 'FR');
    const us = result.world_map.find((r) => r.country === 'US');
    const de = result.world_map.find((r) => r.country === 'DE');

    expect(fr?.value).toBe(3);
    expect(us?.value).toBe(2);
    expect(de?.value).toBe(1);
  });

  it('returns empty array when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryTrendAggregate(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'nonexistent_event', label: 'None' }],
      aggregate_type: 'world_map',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.type).toBe('world_map');
    if (result.type !== 'world_map') {throw new Error('unexpected type');}
    expect(result.world_map).toHaveLength(0);
  });
});

describe('queryTrendAggregate — calendar_heatmap', () => {
  it('groups events by hour_of_day and day_of_week', async () => {
    const projectId = randomUUID();

    // Insert events at specific known times (UTC)
    // ts(3, 10) = 3 days ago at 10:00 UTC
    // ts(3, 14) = 3 days ago at 14:00 UTC
    // ts(2, 10) = 2 days ago at 10:00 UTC
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'click', timestamp: ts(3, 14) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u4', event_name: 'click', timestamp: ts(2, 10) }),
    ]);

    const result = await queryTrendAggregate(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      aggregate_type: 'calendar_heatmap',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      timezone: 'UTC',
    });

    expect(result.type).toBe('calendar_heatmap');
    if (result.type !== 'calendar_heatmap') {throw new Error('unexpected type');}

    // Should have at least 2 distinct hour_of_day values (10 and 14)
    const hours = new Set(result.heatmap.map((r) => r.hour_of_day));
    expect(hours.has(10)).toBe(true);
    expect(hours.has(14)).toBe(true);

    // Total event count across all cells should be 4
    const totalValue = result.heatmap.reduce((sum, r) => sum + r.value, 0);
    expect(totalValue).toBe(4);

    // day_of_week values should be 1-7 (ClickHouse toDayOfWeek default: 1=Mon, 7=Sun)
    for (const row of result.heatmap) {
      expect(row.day_of_week).toBeGreaterThanOrEqual(1);
      expect(row.day_of_week).toBeLessThanOrEqual(7);
      expect(row.hour_of_day).toBeGreaterThanOrEqual(0);
      expect(row.hour_of_day).toBeLessThanOrEqual(23);
    }
  });

  it('respects timezone for hour extraction', async () => {
    const projectId = randomUUID();

    // Insert an event at 23:00 UTC. In US/Eastern (UTC-5) that's 18:00.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', timestamp: ts(3, 23) }),
    ]);

    const resultUtc = await queryTrendAggregate(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      aggregate_type: 'calendar_heatmap',
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'UTC',
    });

    expect(resultUtc.type).toBe('calendar_heatmap');
    if (resultUtc.type !== 'calendar_heatmap') {throw new Error('unexpected type');}
    expect(resultUtc.heatmap).toHaveLength(1);
    expect(resultUtc.heatmap[0].hour_of_day).toBe(23);

    const resultEt = await queryTrendAggregate(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      aggregate_type: 'calendar_heatmap',
      date_from: daysAgo(5),
      date_to: daysAgo(1),
      timezone: 'US/Eastern',
    });

    expect(resultEt.type).toBe('calendar_heatmap');
    if (resultEt.type !== 'calendar_heatmap') {throw new Error('unexpected type');}
    expect(resultEt.heatmap).toHaveLength(1);
    // 23:00 UTC → 18:00 US/Eastern (EST, UTC-5)
    expect(resultEt.heatmap[0].hour_of_day).toBe(18);
  });

  it('returns empty array when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryTrendAggregate(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'nonexistent', label: 'None' }],
      aggregate_type: 'calendar_heatmap',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      timezone: 'UTC',
    });

    expect(result.type).toBe('calendar_heatmap');
    if (result.type !== 'calendar_heatmap') {throw new Error('unexpected type');}
    expect(result.heatmap).toHaveLength(0);
  });
});
