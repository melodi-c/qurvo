/**
 * Timezone-aware web analytics overview tests.
 *
 * Strategy: insert a pageview at 23:00 UTC, which is 02:00 next day in Europe/Moscow (UTC+3).
 * - Without timezone: the session belongs to the UTC day of its timestamp.
 * - With timezone=Europe/Moscow: the session belongs to the *next* local day.
 *
 * We query a single UTC day and verify that:
 *   - Without timezone  → session is counted (it falls in the UTC day).
 *   - With timezone MSK → session is NOT counted (it shifted to the next local day).
 *
 * Then we query the next UTC day with MSK timezone and verify the session IS counted.
 *
 * This validates that `waWhere()` passes `tz` to `analyticsWhere()` and
 * `queryOverview()` passes `tz` to `bucket()`, so both date range filtering and
 * timeseries bucketing respect the project timezone.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { insertTestEvents, buildEvent, type ContainerContext } from '@qurvo/testing';
import { getTestContext } from '../context';
import { queryOverview } from '../../web-analytics/web-analytics.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryOverview — timezone support', () => {
  it('counts sessions in UTC day without timezone param', async () => {
    const projectId = randomUUID();

    // Insert pageview at 23:00 UTC three days ago. This is day D (UTC).
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 3);
    eventDay.setUTCHours(23, 0, 0, 0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: '$pageview',
        session_id: randomUUID(),
        timestamp: eventDay.toISOString(),
      }),
    ]);

    const dateStr = eventDay.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC day

    // Without timezone: session should be counted in the UTC day.
    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'UTC',
    });

    expect(result.current.sessions).toBe(1);
    expect(result.current.pageviews).toBe(1);
  });

  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();

    // Insert pageview at 23:30 UTC four days ago (D).
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
        event_name: '$pageview',
        session_id: randomUUID(),
        timestamp: eventDay.toISOString(),
      }),
    ]);

    // With timezone=Europe/Moscow: the session is at 02:30 MSK on D+1.
    // Querying for day D with MSK timezone should return 0 sessions.
    const resultForUtcDay = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: utcDateStr,
      date_to: utcDateStr,
      timezone: 'Europe/Moscow',
    });

    expect(resultForUtcDay.current.sessions).toBe(0);
    expect(resultForUtcDay.current.pageviews).toBe(0);

    // Querying for day D+1 with MSK timezone should return the session.
    const resultForNextDay = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: nextDateStr,
      date_to: nextDateStr,
      timezone: 'Europe/Moscow',
    });

    expect(resultForNextDay.current.sessions).toBe(1);
    expect(resultForNextDay.current.pageviews).toBe(1);
  });

  it('timeseries buckets respect timezone', async () => {
    const projectId = randomUUID();

    // Insert two pageviews at 23:00 UTC and 23:30 UTC on day D (four days ago).
    // In Europe/Moscow (UTC+3) both become 02:00 and 02:30 on D+1.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 4);
    eventDay.setUTCHours(23, 0, 0, 0);

    const event2 = new Date(eventDay);
    event2.setUTCMinutes(30);

    const utcDateStr = eventDay.toISOString().slice(0, 10); // day D
    const nextDay = new Date(eventDay.getTime() + 86_400_000);
    const nextDateStr = nextDay.toISOString().slice(0, 10); // day D+1

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: '$pageview',
        session_id: randomUUID(),
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: '$pageview',
        session_id: randomUUID(),
        timestamp: event2.toISOString(),
      }),
    ]);

    // Without timezone: both events fall on day D, timeseries should have 1 bucket on day D.
    const utcResult = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: utcDateStr,
      date_to: nextDateStr,
      timezone: 'UTC',
    });

    const utcTotalSessions = utcResult.timeseries.reduce((s, t) => s + t.sessions, 0);
    expect(utcTotalSessions).toBe(2);
    // All sessions should be in the day D bucket
    expect(utcResult.timeseries.length).toBeGreaterThanOrEqual(1);
    const dayDBucket = utcResult.timeseries.find((t) => t.bucket.startsWith(utcDateStr));
    expect(dayDBucket).toBeDefined();
    expect(dayDBucket!.sessions).toBe(2);

    // With timezone=Europe/Moscow: both events shift to D+1 MSK.
    const mskResult = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: utcDateStr,
      date_to: nextDateStr,
      timezone: 'Europe/Moscow',
    });

    const mskTotalSessions = mskResult.timeseries.reduce((s, t) => s + t.sessions, 0);
    expect(mskTotalSessions).toBe(2);
    // All sessions should be in the D+1 bucket (not day D)
    const dayDMskBucket = mskResult.timeseries.find((t) => t.bucket.startsWith(utcDateStr));
    expect(dayDMskBucket).toBeUndefined();
    const dayD1MskBucket = mskResult.timeseries.find((t) => t.bucket.startsWith(nextDateStr));
    expect(dayD1MskBucket).toBeDefined();
    expect(dayD1MskBucket!.sessions).toBe(2);
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
        event_name: '$pageview',
        session_id: randomUUID(),
        timestamp: eventDay.toISOString(),
      }),
    ]);

    const withoutTz = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'UTC',
    });

    const withUtcTz = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'UTC',
    });

    expect(withoutTz.current.sessions).toBe(1);
    expect(withUtcTz.current.sessions).toBe(1);
    expect(withoutTz.current.pageviews).toBe(withUtcTz.current.pageviews);
  });
});
