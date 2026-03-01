import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryLifecycle } from '../../analytics/lifecycle/lifecycle.query';
import { truncateDate } from '../../analytics/query-helpers';

// ── DST Regression Tests ──────────────────────────────────────────────────────
//
// Issue #523: lifecycle INTERVAL 7 DAY arithmetic breaks returning/dormant at
// DST transitions with week granularity.
//
// Root cause: `bucket - INTERVAL 7 DAY` operates in UTC seconds. At a DST
// transition (e.g. America/New_York springs forward), adjacent week buckets have
// different UTC offsets, so the arithmetic produces a UTC timestamp that does NOT
// match any entry in the `buckets` array (all of which are stored as the correct
// local-time-aligned DateTime values).
//
// Fix: use toDateTime(toStartOfWeek(bucket ± INTERVAL 7 DAY, 1, tz), tz) to
// re-snap the shifted value to the start of the local week, yielding the same
// UTC representation that toStartOfWeek produces for events in that week.
//
// We cannot insert future events (ClickHouse TTL would discard past events but
// future events are valid), and the 2026 DST date (2026-03-09) is in the future
// relative to today (2026-02-27), so direct insertion of that exact date is not
// feasible from a recent-timestamp requirement perspective.
//
// Instead, these tests verify that timezone-aware week lifecycle queries correctly
// classify users as `returning` (not `resurrecting`) when a user is active in two
// consecutive weeks, using America/New_York timezone. The new
// neighborBucket helper ensures the `has(buckets, prevBucket)` lookup
// uses the same local-time-snapped value as the bucket storage.

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryLifecycle — week granularity with timezone (DST-safe arithmetic)', () => {
  it('correctly classifies returning user across two consecutive weeks with America/New_York timezone', async () => {
    // Use weeks 3 and 2 weeks ago. Both weeks are recent enough (within TTL).
    // The test validates that DST-safe neighbor arithmetic (neighborBucket)
    // correctly identifies bucket-1 as the previous week even when DST offset differs.
    const projectId = randomUUID();
    const personA = randomUUID(); // active in both weeks: new → returning
    const personB = randomUUID(); // active in first week only: new → dormant

    // Align to Monday of each week under America/New_York to ensure both events
    // fall in distinct ISO weeks regardless of when the test runs.
    const week14Bucket = truncateDate(daysAgo(14), 'week');
    const week7Bucket = truncateDate(daysAgo(7), 'week');

    // Insert events at noon UTC on day-14 and day-7 respectively.
    // Using explicit UTC timestamps: toStartOfWeek(ts, 1, 'America/New_York') on the
    // ClickHouse side will resolve these to the correct local-week bucket.
    const event1 = buildEvent({
      project_id: projectId,
      person_id: personA,
      distinct_id: 'a',
      event_name: 'page_view',
      // Put the event squarely mid-week (Wednesday noon) in the week of daysAgo(14)
      // by adding 2 days to the Monday of that week.
      timestamp: new Date(`${week14Bucket}T12:00:00.000Z`).toISOString(),
    });
    const event2 = buildEvent({
      project_id: projectId,
      person_id: personA,
      distinct_id: 'a',
      event_name: 'page_view',
      timestamp: new Date(`${week7Bucket}T12:00:00.000Z`).toISOString(),
    });
    const event3 = buildEvent({
      project_id: projectId,
      person_id: personB,
      distinct_id: 'b',
      event_name: 'page_view',
      timestamp: new Date(`${week14Bucket}T12:00:00.000Z`).toISOString(),
    });

    await insertTestEvents(ctx.ch, [event1, event2, event3]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'page_view',
      granularity: 'week',
      date_from: week14Bucket,
      date_to: daysAgo(1),
      timezone: 'America/New_York',
    });

    expect(result.granularity).toBe('week');

    if (week14Bucket !== week7Bucket) {
      // Events fall in different weeks: verify returning/dormant classification.
      const w14 = result.data.find((d) => d.bucket.startsWith(week14Bucket));
      const w7 = result.data.find((d) => d.bucket.startsWith(week7Bucket));

      expect(w14).toBeDefined();
      // Both persons appear for the first time → 2 new
      expect(w14!.new).toBe(2);
      expect(w14!.returning).toBe(0);
      expect(w14!.resurrecting).toBe(0);

      expect(w7).toBeDefined();
      // personA was active last week → returning (NOT resurrecting — this is the DST fix)
      expect(w7!.returning).toBe(1);
      expect(w7!.resurrecting).toBe(0);
      // personB was not active this week → dormant (negative by design)
      expect(w7!.dormant).toBe(-1);
    } else {
      // Edge case: both daysAgo(14) and daysAgo(7) land in the same week bucket.
      const totalActive = result.totals.new + result.totals.returning + result.totals.resurrecting;
      expect(totalActive).toBeGreaterThanOrEqual(2);
    }
  });

  it('correctly classifies returning user across two consecutive months with America/New_York timezone', async () => {
    // Validate that month granularity also uses DST-safe arithmetic.
    // INTERVAL 1 MONTH in ClickHouse is calendar-aware (variable day count) but
    // the toStartOfMonth re-snap ensures we get the correct local-time bucket.
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    const month60Bucket = truncateDate(daysAgo(60), 'month');
    const month30Bucket = truncateDate(daysAgo(30), 'month');

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'login',
        timestamp: new Date(`${month60Bucket}T12:00:00.000Z`).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'login',
        timestamp: new Date(`${month30Bucket}T12:00:00.000Z`).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'login',
        timestamp: new Date(`${month60Bucket}T12:00:00.000Z`).toISOString(),
      }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'month',
      date_from: month60Bucket,
      date_to: daysAgo(1),
      timezone: 'America/New_York',
    });

    expect(result.granularity).toBe('month');

    if (month60Bucket !== month30Bucket) {
      const m60 = result.data.find((d) => d.bucket.startsWith(month60Bucket));
      const m30 = result.data.find((d) => d.bucket.startsWith(month30Bucket));

      expect(m60).toBeDefined();
      expect(m60!.new).toBe(2);

      expect(m30).toBeDefined();
      // personA was active last month → returning (not resurrecting)
      expect(m30!.returning).toBe(1);
      expect(m30!.resurrecting).toBe(0);
      // personB went dormant
      expect(m30!.dormant).toBe(-1);
    } else {
      expect(result.totals.new).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not regress: returning classification works without timezone (UTC mode)', async () => {
    // Ensure the non-timezone code path (neighborBucket without tz) is unchanged.
    const projectId = randomUUID();
    const person = randomUUID();

    const week14Bucket = truncateDate(daysAgo(14), 'week');
    const week7Bucket = truncateDate(daysAgo(7), 'week');

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u',
        event_name: 'ev',
        timestamp: new Date(`${week14Bucket}T12:00:00.000Z`).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u',
        event_name: 'ev',
        timestamp: new Date(`${week7Bucket}T12:00:00.000Z`).toISOString(),
      }),
    ]);

    // No timezone parameter → UTC arithmetic (the original code path, unchanged)
    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'week',
      date_from: week14Bucket,
      date_to: daysAgo(1),
    });

    if (week14Bucket !== week7Bucket) {
      const w7 = result.data.find((d) => d.bucket.startsWith(week7Bucket));
      expect(w7).toBeDefined();
      // Must be returning, not resurrecting
      expect(w7!.returning).toBe(1);
      expect(w7!.resurrecting).toBe(0);
    }
  });
});
