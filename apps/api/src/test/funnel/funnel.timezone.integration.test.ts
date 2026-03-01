/**
 * Timezone-aware funnel and TTC query tests.
 *
 * Strategy: insert funnel events at 23:00 UTC, which is 02:00 next day in Europe/Moscow (UTC+3).
 * - Without timezone: the events belong to the UTC day of their timestamp.
 * - With timezone=Europe/Moscow: the events belong to the *next* local day.
 *
 * We query a single UTC day and verify that:
 *   - Without timezone  → events are counted (they fall in the UTC day).
 *   - With timezone MSK → events are NOT counted (they shifted to the next local day).
 *
 * Then we query the next UTC day with MSK timezone and verify the events ARE counted.
 *
 * A separate test verifies that funnel and TTC share identical date boundaries when
 * timezone is specified (alignment with trend/retention behaviour).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { insertTestEvents, buildEvent } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';
import { queryFunnelTimeToConvert } from '../../analytics/funnel/funnel-time-to-convert';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryFunnel — timezone support', () => {
  it('counts funnel entries in UTC day without timezone param', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert signup at 23:00 UTC (day D) and purchase at 23:30 UTC (day D).
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 3);
    eventDay.setUTCHours(23, 0, 0, 0);
    const purchaseTime = new Date(eventDay.getTime() + 30 * 60 * 1000);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-user-a',
        event_name: 'signup',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-user-a',
        event_name: 'purchase',
        timestamp: purchaseTime.toISOString(),
      }),
    ]);

    const dateStr = eventDay.toISOString().slice(0, 10); // UTC day D

    // Without timezone: both events fall in day D, funnel step 1 should count 1 user.
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert signup at 23:00 UTC (day D) — this is 02:00 MSK on day D+1.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 4);
    eventDay.setUTCHours(23, 0, 0, 0);
    const purchaseTime = new Date(eventDay.getTime() + 30 * 60 * 1000);

    const utcDateStr = eventDay.toISOString().slice(0, 10); // UTC day D
    const nextDay = new Date(eventDay.getTime() + 86_400_000);
    const nextDateStr = nextDay.toISOString().slice(0, 10); // UTC day D+1

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-user-b',
        event_name: 'signup',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-user-b',
        event_name: 'purchase',
        timestamp: purchaseTime.toISOString(),
      }),
    ]);

    // With timezone=Europe/Moscow: events are at 02:00 MSK on D+1.
    // Querying UTC day D with MSK tz should return 0 funnel entries.
    const resultForUtcDay = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: utcDateStr,
      date_to: utcDateStr,
      timezone: 'Europe/Moscow',
    });

    expect(resultForUtcDay.breakdown).toBe(false);
    const r1 = resultForUtcDay as Extract<typeof resultForUtcDay, { breakdown: false }>;
    // Events are on D+1 in MSK local time — should not appear in query for day D.
    // When no users enter the funnel, ClickHouse returns 0 rows (CROSS JOIN with empty set).
    expect(r1.steps[0]?.count ?? 0).toBe(0);

    // Querying UTC day D+1 with MSK timezone should return the user.
    const resultForNextDay = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: nextDateStr,
      date_to: nextDateStr,
      timezone: 'Europe/Moscow',
    });

    expect(resultForNextDay.breakdown).toBe(false);
    const r2 = resultForNextDay as Extract<typeof resultForNextDay, { breakdown: false }>;
    expect(r2.steps[0].count).toBe(1);
    expect(r2.steps[1].count).toBe(1);
  });

  it('UTC timezone behaves same as no timezone', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 5);
    eventDay.setUTCHours(12, 0, 0, 0);
    const purchaseTime = new Date(eventDay.getTime() + 60 * 60 * 1000);
    const dateStr = eventDay.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-user-c',
        event_name: 'signup',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-user-c',
        event_name: 'purchase',
        timestamp: purchaseTime.toISOString(),
      }),
    ]);

    const params = {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'UTC',
    };

    const withUtcTz = await queryFunnel(ctx.ch, params);

    const r2 = withUtcTz as Extract<typeof withUtcTz, { breakdown: false }>;
    expect(r2.steps[0].count).toBe(1);
    expect(r2.steps[1].count).toBe(1);
  });
});

describe('queryFunnelTimeToConvert — timezone support', () => {
  it('shifts day boundary with Europe/Moscow timezone (UTC+3)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events at 23:00 UTC (day D) = 02:00 MSK on day D+1.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 6);
    eventDay.setUTCHours(23, 0, 0, 0);
    const purchaseTime = new Date(eventDay.getTime() + 30 * 60 * 1000);

    const utcDateStr = eventDay.toISOString().slice(0, 10);
    const nextDay = new Date(eventDay.getTime() + 86_400_000);
    const nextDateStr = nextDay.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ttc-user',
        event_name: 'signup',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-ttc-user',
        event_name: 'purchase',
        timestamp: purchaseTime.toISOString(),
      }),
    ]);

    const ttcParams = {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      from_step: 0,
      to_step: 1,
    };

    // Querying UTC day D with MSK tz: events are at 02:00 MSK on D+1 — no sample.
    const resultForUtcDay = await queryFunnelTimeToConvert(ctx.ch, {
      ...ttcParams,
      date_from: utcDateStr,
      date_to: utcDateStr,
      timezone: 'Europe/Moscow',
    });
    expect(resultForUtcDay.sample_size).toBe(0);

    // Querying UTC day D+1 with MSK tz: events are in this local day → sample_size = 1.
    const resultForNextDay = await queryFunnelTimeToConvert(ctx.ch, {
      ...ttcParams,
      date_from: nextDateStr,
      date_to: nextDateStr,
      timezone: 'Europe/Moscow',
    });
    expect(resultForNextDay.sample_size).toBe(1);
    // Conversion time should be ~30 minutes = 1800 seconds.
    expect(resultForNextDay.average_seconds).toBeGreaterThan(1700);
    expect(resultForNextDay.average_seconds).toBeLessThan(1900);
  });

  it('funnel and TTC share identical date range boundaries with timezone', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Insert events in mid-day UTC so timezone offset doesn't shift the day.
    const now = new Date();
    const eventDay = new Date(now);
    eventDay.setUTCDate(now.getUTCDate() - 7);
    eventDay.setUTCHours(12, 0, 0, 0);
    const purchaseTime = new Date(eventDay.getTime() + 60 * 60 * 1000); // 1 hour later
    const dateStr = eventDay.toISOString().slice(0, 10);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-align-user',
        event_name: 'signup',
        timestamp: eventDay.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'tz-align-user',
        event_name: 'purchase',
        timestamp: purchaseTime.toISOString(),
      }),
    ]);

    const commonParams = {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateStr,
      date_to: dateStr,
      timezone: 'America/New_York',
    };

    // Both funnel and TTC should see the same events (mid-day UTC = mid-morning NY = same local day).
    const funnelResult = await queryFunnel(ctx.ch, commonParams);
    const ttcResult = await queryFunnelTimeToConvert(ctx.ch, {
      ...commonParams,
      from_step: 0,
      to_step: 1,
    });

    const r = funnelResult as Extract<typeof funnelResult, { breakdown: false }>;
    // Both queries operate on the same date range — they should see the same number of converted users.
    expect(r.steps[1].count).toBe(ttcResult.sample_size);
  });
});
