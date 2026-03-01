/**
 * Timezone-aware stickiness query tests.
 *
 * Strategy: insert events at 23:00-23:30 UTC, which is 02:00-02:30 next day in
 * Europe/Moscow (UTC+3).
 * - Without timezone: events belong to the UTC day of their timestamp.
 * - With timezone=Europe/Moscow: events shift to the next local day.
 *
 * For stickiness, this means a user who fires events at 23:00 UTC on two
 * consecutive days has 2 active UTC days, but in Europe/Moscow those events land
 * on two consecutive MSK days (shifted by +1). When querying a date range that
 * covers the UTC days but not the MSK days, the user should not appear.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { insertTestEvents, buildEvent, daysAgo } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryStickiness } from '../../analytics/stickiness/stickiness.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryStickiness — timezone day boundary shift', () => {
  it('counts active days in UTC without timezone param', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at 23:00 UTC on day D-5 and 23:00 UTC on day D-4.
    // Without timezone, these are 2 different UTC days.
    const now = new Date();
    const dayD5 = new Date(now);
    dayD5.setUTCDate(now.getUTCDate() - 5);
    dayD5.setUTCHours(23, 0, 0, 0);

    const dayD4 = new Date(now);
    dayD4.setUTCDate(now.getUTCDate() - 4);
    dayD4.setUTCHours(23, 0, 0, 0);

    const dateFromStr = dayD5.toISOString().slice(0, 10);
    const dateToStr = dayD4.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-stick-a',
        event_name: 'login',
        timestamp: dayD5.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-stick-a',
        event_name: 'login',
        timestamp: dayD4.toISOString(),
      }),
    ]);

    // Without timezone: personA active on 2 UTC days.
    const result = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: dateFromStr,
      date_to: dateToStr,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].period_count).toBe(2);
    expect(result.data[0].user_count).toBe(1);
  });

  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at 23:30 UTC on day D-6 and 23:30 UTC on day D-5.
    // UTC: events on day D-6 and day D-5.
    // MSK (UTC+3): events at 02:30 on day D-5 and 02:30 on day D-4.
    const now = new Date();
    const eventDay1 = new Date(now);
    eventDay1.setUTCDate(now.getUTCDate() - 6);
    eventDay1.setUTCHours(23, 30, 0, 0);

    const eventDay2 = new Date(now);
    eventDay2.setUTCDate(now.getUTCDate() - 5);
    eventDay2.setUTCHours(23, 30, 0, 0);

    const utcDateFrom = eventDay1.toISOString().slice(0, 10); // UTC day D-6
    const utcDateTo = eventDay2.toISOString().slice(0, 10); // UTC day D-5

    // MSK local days where events land:
    const mskDay1 = new Date(eventDay1.getTime() + 86_400_000);
    const mskDateFrom = mskDay1.toISOString().slice(0, 10); // UTC day D-5 = MSK day of event 1
    const mskDay2 = new Date(eventDay2.getTime() + 86_400_000);
    const mskDateTo = mskDay2.toISOString().slice(0, 10); // UTC day D-4 = MSK day of event 2

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-stick-msk',
        event_name: 'login',
        timestamp: eventDay1.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-stick-msk',
        event_name: 'login',
        timestamp: eventDay2.toISOString(),
      }),
    ]);

    // WITH timezone=Europe/Moscow querying UTC days D-6..D-5:
    // In MSK, events are on D-5 and D-4. Day D-6 in MSK has no events.
    // Day D-5 in MSK has 1 event (the first one). Day D-5 is within the range.
    // But the second event is on D-4 in MSK, which is outside [D-6, D-5].
    // So personA should have only 1 active MSK day within this range.
    const resultMskNarrow = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: utcDateFrom,
      date_to: utcDateTo,
      timezone: 'Europe/Moscow',
    });

    // personA has 1 active day in MSK within [D-6, D-5] (the first event shifts to D-5)
    const narrowMap = new Map(resultMskNarrow.data.map((d) => [d.period_count, d.user_count]));
    expect(narrowMap.get(1)).toBe(1);
    // Should NOT have 2 active days (that would mean timezone isn't applied)
    expect(narrowMap.get(2)).toBeUndefined();

    // WITH timezone=Europe/Moscow querying the MSK local days D-5..D-4:
    // Both events fall within this range. personA should have 2 active MSK days.
    const resultMskFull = await queryStickiness(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: mskDateFrom,
      date_to: mskDateTo,
      timezone: 'Europe/Moscow',
    });

    const fullMap = new Map(resultMskFull.data.map((d) => [d.period_count, d.user_count]));
    expect(fullMap.get(2)).toBe(1);
  });

  it('UTC timezone behaves same as no timezone', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at noon UTC (safe from boundary effects).
    const day5Str = daysAgo(5);
    const day3Str = daysAgo(3);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-stick-utc',
        event_name: 'login',
        timestamp: new Date(`${day5Str}T12:00:00.000Z`).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-stick-utc',
        event_name: 'login',
        timestamp: new Date(`${day3Str}T12:00:00.000Z`).toISOString(),
      }),
    ]);

    const params = {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day' as const,
      date_from: day5Str,
      date_to: day3Str,
    };

    const withoutTz = await queryStickiness(ctx.ch, params);
    const withUtcTz = await queryStickiness(ctx.ch, { ...params, timezone: 'UTC' });

    expect(withoutTz.data).toHaveLength(1);
    expect(withUtcTz.data).toHaveLength(1);
    expect(withoutTz.data[0].period_count).toBe(withUtcTz.data[0].period_count);
    expect(withoutTz.data[0].user_count).toBe(withUtcTz.data[0].user_count);
    expect(withoutTz.total_periods).toBe(withUtcTz.total_periods);
  });
});
