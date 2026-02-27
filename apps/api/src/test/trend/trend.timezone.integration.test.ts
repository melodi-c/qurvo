/**
 * Timezone-aware trend query tests.
 *
 * Strategy: insert an event at 23:00 UTC, which is 02:00 next day in Europe/Moscow (UTC+3).
 * - Without timezone: the event belongs to the UTC day of its timestamp.
 * - With timezone=Europe/Moscow: the event belongs to the *next* local day.
 *
 * We query a single UTC day and verify that:
 *   - Without timezone  → event is counted (it falls in the UTC day).
 *   - With timezone MSK → event is NOT counted (it shifted to the next local day).
 *
 * Then we query the next UTC day with MSK timezone and verify it IS counted.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { insertTestEvents, buildEvent } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryTrend } from '../../analytics/trend/trend.query';
import { sumSeriesValues } from '../helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryTrend — timezone support', () => {
  it('counts events in UTC day without timezone param', async () => {
    const projectId = randomUUID();

    // Insert event at 23:00 UTC three days ago. This is day D (UTC).
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 3);
    eventDay.setUTCHours(23, 0, 0, 0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'page_view',
        timestamp: eventDay.toISOString(),
      }),
    ]);

    const dateStr = eventDay.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC day

    // Without timezone: event should be counted in the UTC day.
    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateStr,
      date_to: dateStr,
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();

    // Insert event at 23:30 UTC four days ago (D).
    // In Europe/Moscow (UTC+3), this is 02:30 on day D+1.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 4);
    eventDay.setUTCHours(23, 30, 0, 0);

    const utcDateStr = eventDay.toISOString().slice(0, 10); // day D in UTC

    // day D+1 in UTC
    const nextDay = new Date(eventDay.getTime() + 86_400_000);
    const nextDateStr = nextDay.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'page_view',
        timestamp: eventDay.toISOString(),
      }),
    ]);

    // With timezone=Europe/Moscow: the event falls on day D+1 local time.
    // Querying for UTC day D should return 0 events.
    const resultForUtcDay = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: utcDateStr,
      date_to: utcDateStr,
      timezone: 'Europe/Moscow',
    });

    expect(resultForUtcDay.compare).toBe(false);
    expect(resultForUtcDay.breakdown).toBe(false);
    const r1 = resultForUtcDay as Extract<typeof resultForUtcDay, { compare: false; breakdown: false }>;
    // The event is 02:30 MSK on D+1, so it should NOT appear in MSK day D query.
    expect(sumSeriesValues(r1.series[0].data)).toBe(0);

    // Querying for UTC day D+1 with MSK timezone should return the event (02:30 MSK = within D+1 MSK).
    const resultForNextDay = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: nextDateStr,
      date_to: nextDateStr,
      timezone: 'Europe/Moscow',
    });

    expect(resultForNextDay.compare).toBe(false);
    expect(resultForNextDay.breakdown).toBe(false);
    const r2 = resultForNextDay as Extract<typeof resultForNextDay, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r2.series[0].data)).toBe(1);
  });

  it('UTC timezone behaves same as no timezone', async () => {
    const projectId = randomUUID();

    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 5);
    eventDay.setUTCHours(12, 0, 0, 0);
    const dateStr = eventDay.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'click',
        timestamp: eventDay.toISOString(),
      }),
    ]);

    const withoutTz = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateStr,
      date_to: dateStr,
    });

    const withUtcTz = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'click', label: 'Clicks' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'UTC',
    });

    const r1 = withoutTz as Extract<typeof withoutTz, { compare: false; breakdown: false }>;
    const r2 = withUtcTz as Extract<typeof withUtcTz, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r1.series[0].data)).toBe(1);
    expect(sumSeriesValues(r2.series[0].data)).toBe(1);
  });
});
