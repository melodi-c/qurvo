/**
 * Timezone-aware paths query tests.
 *
 * Strategy: insert events at 23:00-23:30 UTC, which is 02:00-02:30 next day in
 * Europe/Moscow (UTC+3).
 * - Without timezone: events belong to the UTC day of their timestamp.
 * - With timezone=Europe/Moscow: events shift to the next local day.
 *
 * For paths, this means the date_from/date_to filter shifts: events at 23:00 UTC
 * on day D are included when querying day D without timezone, but excluded when
 * querying day D with Europe/Moscow (they belong to D+1 in MSK).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { insertTestEvents, buildEvent, msAgo, dateOffset } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryPaths } from '../../analytics/paths/paths.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryPaths — timezone support', () => {
  it('counts path transitions in UTC day without timezone param', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at 23:00 UTC on day D-3 — within the UTC day.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 3);
    eventDay.setUTCHours(23, 0, 0, 0);
    const secondEvent = new Date(eventDay.getTime() + 10 * 60 * 1000); // +10min

    const utcDateStr = eventDay.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-path-utc',
        event_name: 'pageview',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-path-utc',
        event_name: 'signup',
        timestamp: secondEvent.toISOString(),
      }),
    ]);

    // Without timezone: events at 23:00-23:10 UTC are on day D-3.
    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: utcDateStr,
      date_to: utcDateStr,
      step_limit: 5,
    });

    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].source).toBe('pageview');
    expect(result.transitions[0].target).toBe('signup');
    expect(result.transitions[0].person_count).toBe(1);
  });

  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at 23:00 UTC on day D-3.
    // UTC: events on day D-3.
    // MSK (UTC+3): events at 02:00 on day D-2.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 3);
    eventDay.setUTCHours(23, 0, 0, 0);
    const secondEvent = new Date(eventDay.getTime() + 10 * 60 * 1000); // +10min

    const utcDateStr = eventDay.toISOString().slice(0, 10); // UTC day D-3
    const nextDay = new Date(eventDay.getTime() + 86_400_000);
    const nextDateStr = nextDay.toISOString().slice(0, 10); // UTC day D-2

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-path-msk',
        event_name: 'pageview',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-path-msk',
        event_name: 'signup',
        timestamp: secondEvent.toISOString(),
      }),
    ]);

    // WITHOUT timezone: events at 23:00-23:10 UTC fall in day D-3.
    const resultUtc = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: utcDateStr,
      date_to: utcDateStr,
      step_limit: 5,
    });
    expect(resultUtc.transitions).toHaveLength(1);
    expect(resultUtc.transitions[0].source).toBe('pageview');
    expect(resultUtc.transitions[0].target).toBe('signup');

    // WITH timezone=Europe/Moscow: events are at 02:00 MSK on D-2 — NOT in day D-3.
    const resultMskDayD3 = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: utcDateStr,
      date_to: utcDateStr,
      step_limit: 5,
      timezone: 'Europe/Moscow',
    });
    expect(resultMskDayD3.transitions).toHaveLength(0);

    // WITH timezone=Europe/Moscow and querying D-2: events SHOULD appear.
    const resultMskDayD2 = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: nextDateStr,
      date_to: nextDateStr,
      step_limit: 5,
      timezone: 'Europe/Moscow',
    });
    expect(resultMskDayD2.transitions).toHaveLength(1);
    expect(resultMskDayD2.transitions[0].source).toBe('pageview');
    expect(resultMskDayD2.transitions[0].target).toBe('signup');
  });

  it('UTC timezone behaves same as no timezone', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-path-eq',
        event_name: 'pageview',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-path-eq',
        event_name: 'signup',
        timestamp: msAgo(2000),
      }),
    ]);

    const params = {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
    };

    const withoutTz = await queryPaths(ctx.ch, params);
    const withUtcTz = await queryPaths(ctx.ch, { ...params, timezone: 'UTC' });

    expect(withoutTz.transitions).toHaveLength(1);
    expect(withUtcTz.transitions).toHaveLength(1);
    expect(withoutTz.transitions[0]).toEqual(withUtcTz.transitions[0]);
  });
});
