import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { getTestContext } from '../context';
import { queryTrend } from '../../analytics/trend/trend.query';
import { sumSeriesValues } from '../helpers';

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
