/**
 * Integration tests for relative date resolution with real ClickHouse queries.
 *
 * Verifies that `resolveRelativeDate()` produces correct absolute dates that,
 * when passed to `queryTrend()`, return the expected results from ClickHouse.
 *
 * Covers: -Nd offset, mStart anchor, and mixed relative+absolute usage.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  ts,
  daysAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryTrend } from '../../analytics/trend/trend.query';
import { resolveRelativeDate } from '../../analytics/query-helpers/time';
import { sumSeriesValues } from '../helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryTrend with resolved relative dates', () => {
  it('resolves -7d and returns correct event count from ClickHouse', async () => {
    const projectId = randomUUID();

    // Insert 2 events 5 days ago and 1 event 3 days ago.
    // All fall within the -7d..today window.
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'page_view', timestamp: ts(5, 14) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'page_view', timestamp: ts(3, 12) }),
    ]);

    // Resolve relative dates to absolute YYYY-MM-DD
    const dateFrom = resolveRelativeDate('-7d');
    const dateTo = resolveRelativeDate('-1d');

    // Sanity: resolved dates should be valid YYYY-MM-DD strings
    expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify resolved dates match expected values
    expect(dateFrom).toBe(daysAgo(7));
    expect(dateTo).toBe(daysAgo(1));

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Page Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateFrom,
      date_to: dateTo,
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    // All 3 events are within -7d..-1d range
    expect(sumSeriesValues(r.series[0].data)).toBe(3);
  });

  it('resolves mStart and queries events from start of current month', async () => {
    const projectId = randomUUID();

    // Determine the first day of the current month
    const now = new Date();
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // Insert an event on the 1st of this month at noon UTC.
    // This guarantees it falls within the mStart..today window.
    const eventOnFirst = new Date(firstOfMonth);
    eventOnFirst.setUTCHours(12, 0, 0, 0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'signup',
        timestamp: eventOnFirst.toISOString(),
      }),
    ]);

    // Resolve mStart
    const dateFrom = resolveRelativeDate('mStart');
    const dateTo = daysAgo(0); // today

    // mStart should resolve to YYYY-MM-01
    expect(dateFrom).toBe(firstOfMonth.toISOString().slice(0, 10));

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'signup', label: 'Signups' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateFrom,
      date_to: dateTo,
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('excludes events outside the resolved relative range', async () => {
    const projectId = randomUUID();

    // Insert one event 3 days ago (inside -5d range) and one 10 days ago (outside).
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'click', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'click', timestamp: ts(10, 12) }),
    ]);

    const dateFrom = resolveRelativeDate('-5d');
    const dateTo = resolveRelativeDate('-1d');

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateFrom,
      date_to: dateTo,
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    // Only the event 3 days ago should be counted; the one 10 days ago is outside the range.
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('works with mixed relative date_from and absolute date_to', async () => {
    const projectId = randomUUID();

    // Insert events 2 and 4 days ago
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'purchase', timestamp: ts(2, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'purchase', timestamp: ts(4, 10) }),
    ]);

    // Relative date_from, absolute date_to
    const dateFrom = resolveRelativeDate('-7d');
    const dateTo = daysAgo(0); // absolute today

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'purchase', label: 'Purchases' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateFrom,
      date_to: dateTo,
      timezone: 'UTC',
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(r.series).toHaveLength(1);
    expect(sumSeriesValues(r.series[0].data)).toBe(2);
  });
});
