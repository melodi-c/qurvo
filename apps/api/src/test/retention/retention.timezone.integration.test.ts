/**
 * Timezone-aware retention query tests.
 *
 * Strategy: insert events at 23:00-23:30 UTC, which is 02:00-02:30 next day in
 * Europe/Moscow (UTC+3).
 * - Without timezone: events belong to the UTC day of their timestamp.
 * - With timezone=Europe/Moscow: events belong to the *next* local day.
 *
 * For retention specifically, we verify that cohort_date labels and period
 * membership shift correctly when timezone is applied.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { insertTestEvents, buildEvent, daysAgo } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryRetention } from '../../analytics/retention/retention.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryRetention — timezone support', () => {
  it('counts retention cohort in UTC day without timezone param', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at 23:00 UTC on day D-5 and day D-4.
    // Without timezone, both events fall in their respective UTC days.
    const now = new Date();
    const dayD5 = new Date(now);
    dayD5.setUTCDate(now.getUTCDate() - 5);
    dayD5.setUTCHours(23, 0, 0, 0);

    const dayD4 = new Date(now);
    dayD4.setUTCDate(now.getUTCDate() - 4);
    dayD4.setUTCHours(23, 0, 0, 0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ret-a',
        event_name: 'login',
        timestamp: dayD5.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ret-a',
        event_name: 'login',
        timestamp: dayD4.toISOString(),
      }),
    ]);

    const dateFromStr = dayD5.toISOString().slice(0, 10);
    const dateToStr = dayD5.toISOString().slice(0, 10);

    // Without timezone: personA enters cohort on day D-5, returns on day D-4.
    const result = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: dateFromStr,
      date_to: dateToStr,
    });

    // Should have one cohort (day D-5) with cohort_size = 1
    expect(result.cohorts.length).toBeGreaterThanOrEqual(1);
    const cohort = result.cohorts.find((c) => c.cohort_date === dateFromStr);
    expect(cohort).toBeDefined();
    expect(cohort!.cohort_size).toBe(1);
    // Period 1 should show retention (personA returned the next day)
    expect(cohort!.periods[1]).toBe(1);
  });

  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert event at 23:30 UTC on day D-6 (= 02:30 MSK on day D-5).
    // Insert return event at 23:30 UTC on day D-5 (= 02:30 MSK on day D-4).
    const now = new Date();
    const eventDay1 = new Date(now);
    eventDay1.setUTCDate(now.getUTCDate() - 6);
    eventDay1.setUTCHours(23, 30, 0, 0);

    const eventDay2 = new Date(now);
    eventDay2.setUTCDate(now.getUTCDate() - 5);
    eventDay2.setUTCHours(23, 30, 0, 0);

    const utcDay1Str = eventDay1.toISOString().slice(0, 10); // UTC day D-6

    // Next UTC day (where event 1 lands in MSK time)
    const mskDay1 = new Date(eventDay1.getTime() + 86_400_000);
    const mskDay1Str = mskDay1.toISOString().slice(0, 10); // UTC day D-5 = MSK day of event 1

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ret-msk',
        event_name: 'login',
        timestamp: eventDay1.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ret-msk',
        event_name: 'login',
        timestamp: eventDay2.toISOString(),
      }),
    ]);

    // WITHOUT timezone: query for UTC day D-6 should find personA in the cohort.
    const resultUtc = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: utcDay1Str,
      date_to: utcDay1Str,
    });

    const cohortUtc = resultUtc.cohorts.find((c) => c.cohort_date === utcDay1Str);
    expect(cohortUtc).toBeDefined();
    expect(cohortUtc!.cohort_size).toBe(1);

    // WITH timezone=Europe/Moscow: query for UTC day D-6 should find NO cohort
    // (event at 23:30 UTC = 02:30 MSK next day, so it's not in D-6 MSK).
    const resultMskDayD6 = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: utcDay1Str,
      date_to: utcDay1Str,
      timezone: 'Europe/Moscow',
    });

    const cohortMskD6 = resultMskDayD6.cohorts.find((c) => c.cohort_date === utcDay1Str);
    // Either no cohort at all, or cohort_size is 0
    expect(cohortMskD6?.cohort_size ?? 0).toBe(0);

    // WITH timezone=Europe/Moscow: query for the MSK local day (D-5) should find
    // personA in the cohort, with retention on the next MSK day (D-4).
    const resultMskDayD5 = await queryRetention(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: mskDay1Str,
      date_to: mskDay1Str,
      timezone: 'Europe/Moscow',
    });

    const cohortMskD5 = resultMskDayD5.cohorts.find((c) => c.cohort_date === mskDay1Str);
    expect(cohortMskD5).toBeDefined();
    expect(cohortMskD5!.cohort_size).toBe(1);
    // Period 1: return event is at 02:30 MSK on D-4 (one day later in MSK)
    expect(cohortMskD5!.periods[1]).toBe(1);
  });

  it('UTC timezone behaves same as no timezone', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at noon UTC (safe from boundary effects).
    const day5Str = daysAgo(5);
    const day4Str = daysAgo(4);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ret-utc',
        event_name: 'login',
        timestamp: new Date(`${day5Str}T12:00:00.000Z`).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ret-utc',
        event_name: 'login',
        timestamp: new Date(`${day4Str}T12:00:00.000Z`).toISOString(),
      }),
    ]);

    const params = {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring' as const,
      granularity: 'day' as const,
      periods: 3,
      date_from: day5Str,
      date_to: day5Str,
    };

    const withoutTz = await queryRetention(ctx.ch, params);
    const withUtcTz = await queryRetention(ctx.ch, { ...params, timezone: 'UTC' });

    const r1 = withoutTz.cohorts.find((c) => c.cohort_date === day5Str);
    const r2 = withUtcTz.cohorts.find((c) => c.cohort_date === day5Str);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1!.cohort_size).toBe(r2!.cohort_size);
    expect(r1!.periods[1]).toBe(r2!.periods[1]);
  });
});
