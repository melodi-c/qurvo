import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { queryLifecycle } from '../../analytics/lifecycle/lifecycle.query';
import { truncateDate } from '../../utils/clickhouse-helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryLifecycle — basic classification', () => {
  it('classifies new, returning, and dormant users', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA active on day-4, day-3, day-2 (new on first appearance, returning after)
    // personB active on day-4 only (new, then dormant)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: ts(2, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'pageview', timestamp: ts(4, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'pageview',
      granularity: 'day',
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    expect(result.granularity).toBe('day');
    expect(result.data.length).toBeGreaterThanOrEqual(3);

    // Day -4: both are new
    const day4 = result.data.find((d) => d.bucket.startsWith(daysAgo(4)));
    expect(day4).toBeDefined();
    expect(day4!.new).toBe(2);

    // Day -3: personA is returning, personB is dormant
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.returning).toBe(1);
    // dormant count is returned as a negative number by design:
    // it represents users who were active in the previous period but not in the current one.
    // Using negative values allows rendering as a "below zero" bar in stacked charts.
    expect(day3!.dormant).toBe(-1);

    // Day -2: personA is returning
    const day2 = result.data.find((d) => d.bucket.startsWith(daysAgo(2)));
    expect(day2).toBeDefined();
    expect(day2!.returning).toBe(1);
  });

  it('classifies resurrecting users', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // person active day-6, inactive day-5 and day-4, active day-3 (resurrecting)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'login', timestamp: ts(6, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'login', timestamp: ts(3, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      granularity: 'day',
      date_from: daysAgo(6),
      date_to: daysAgo(2),
    });

    // Day -6: new
    const day6 = result.data.find((d) => d.bucket.startsWith(daysAgo(6)));
    expect(day6).toBeDefined();
    expect(day6!.new).toBe(1);

    // Day -3: resurrecting (person was gone for 2 days)
    const day3 = result.data.find((d) => d.bucket.startsWith(daysAgo(3)));
    expect(day3).toBeDefined();
    expect(day3!.resurrecting).toBe(1);
  });
});

describe('queryLifecycle — totals', () => {
  it('computes totals correctly', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'act', timestamp: ts(2, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'act', timestamp: ts(3, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'act',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
    });

    // Both personA and personB are new on day-3 → 2 new total
    expect(result.totals.new).toBe(2);
    // personA is returning on day-2 → 1 returning total
    expect(result.totals.returning).toBe(1);
    // personB went dormant after day-3 → dormant total is -1 (negative by design)
    expect(result.totals.dormant).toBe(-1);
  });
});

describe('queryLifecycle — empty result', () => {
  it('returns empty data when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'nonexistent',
      granularity: 'day',
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.data).toHaveLength(0);
    expect(result.totals.new).toBe(0);
    expect(result.totals.returning).toBe(0);
    expect(result.totals.resurrecting).toBe(0);
    expect(result.totals.dormant).toBe(0);
  });
});

describe('queryLifecycle — week granularity', () => {
  it('aggregates by week with correct user classification', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Align date_from to the Monday of the week that contains daysAgo(14) so that
    // the first week bucket is always included in the query results. Without this
    // alignment the bucket (e.g. Monday Feb 9) may fall before date_from (e.g.
    // Thursday Feb 12) and get excluded by the query's WHERE bucket >= {from}.
    const week14Bucket = truncateDate(daysAgo(14), 'week');
    const week7Bucket = truncateDate(daysAgo(7), 'week');

    // personA: active in the week of daysAgo(14) and again in the week of daysAgo(7) (new → returning)
    // personB: active in the week of daysAgo(14) only (new → dormant)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'visit', timestamp: ts(14, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'visit', timestamp: ts(7, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'visit', timestamp: ts(14, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'visit',
      granularity: 'week',
      // Use week-aligned date_from so the first week bucket is not excluded
      date_from: week14Bucket,
      date_to: daysAgo(1),
    });

    expect(result.granularity).toBe('week');
    // daysAgo(14) and daysAgo(7) span at least 2 distinct ISO weeks
    expect(result.data.length).toBeGreaterThanOrEqual(2);

    if (week14Bucket !== week7Bucket) {
      // Events fall in different weeks: classic new → returning scenario
      const bucketForWeek14 = result.data.find((d) => d.bucket.startsWith(week14Bucket));
      const bucketForWeek7 = result.data.find((d) => d.bucket.startsWith(week7Bucket));

      expect(bucketForWeek14).toBeDefined();
      // Both persons appear for the first time in the week-14 bucket → 2 new
      expect(bucketForWeek14!.new).toBe(2);

      expect(bucketForWeek7).toBeDefined();
      // personA returns in the week-7 bucket → 1 returning
      expect(bucketForWeek7!.returning).toBe(1);
      // personB went dormant after week-14 → dormant count is -1 (negative by design)
      expect(bucketForWeek7!.dormant).toBe(-1);
    } else {
      // Both events are in the same week bucket (edge case: running close to week boundary).
      // Verify at minimum that the combined active count reflects both persons.
      const totalActive = result.totals.new + result.totals.returning + result.totals.resurrecting;
      expect(totalActive).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('queryLifecycle — month granularity', () => {
  it('aggregates by month and classifies users across calendar months', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Use events spread across three distinct calendar months.
    // daysAgo(60) lands ~2 months ago, daysAgo(30) ~1 month ago, daysAgo(5) this month.
    // personA: active in all three months (new → returning → returning)
    // personB: active in first month only (new → dormant)

    // Align date_from to the 1st of the month that contains daysAgo(60) so that
    // the first month bucket is always included in the query results. Without this
    // alignment the bucket (e.g. 2025-12-01) may fall before date_from (e.g.
    // 2025-12-28) and get excluded by the query's WHERE bucket >= {from}.
    const month60Bucket = truncateDate(daysAgo(60), 'month');
    const month30Bucket = truncateDate(daysAgo(30), 'month');
    const month5Bucket = truncateDate(daysAgo(5), 'month');

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(60, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(30, 12) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'click', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'click', timestamp: ts(60, 12) }),
    ]);

    const result = await queryLifecycle(ctx.ch, {
      project_id: projectId,
      target_event: 'click',
      granularity: 'month',
      // Use month-aligned date_from so the first month bucket is not excluded
      date_from: month60Bucket,
      date_to: daysAgo(1),
    });

    expect(result.granularity).toBe('month');

    // Bucket timestamps must be aligned to the start of a month (YYYY-MM-01 format)
    for (const point of result.data) {
      // ClickHouse returns DateTime as "YYYY-MM-DD HH:MM:SS"; month buckets start on day 01
      expect(point.bucket).toMatch(/^\d{4}-\d{2}-01/);
    }

    if (month60Bucket !== month30Bucket && month30Bucket !== month5Bucket) {
      // All three events land in distinct calendar months — full scenario coverage
      const bucketM60 = result.data.find((d) => d.bucket.startsWith(month60Bucket));
      const bucketM30 = result.data.find((d) => d.bucket.startsWith(month30Bucket));
      const bucketM5 = result.data.find((d) => d.bucket.startsWith(month5Bucket));

      // Month of daysAgo(60): personA and personB are both new
      expect(bucketM60).toBeDefined();
      expect(bucketM60!.new).toBe(2);

      // Month of daysAgo(30): personA is returning, personB went dormant
      expect(bucketM30).toBeDefined();
      expect(bucketM30!.returning).toBe(1);
      // dormant count is negative: personB was active last month but not this one
      expect(bucketM30!.dormant).toBe(-1);

      // Month of daysAgo(5): personA is still returning (consecutive active months)
      expect(bucketM5).toBeDefined();
      expect(bucketM5!.returning).toBe(1);
    } else {
      // Some events share the same month bucket; verify at a minimum that both persons
      // appear as new in the earliest month and totals are internally consistent
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.totals.new).toBeGreaterThanOrEqual(2);
    }
  });
});
