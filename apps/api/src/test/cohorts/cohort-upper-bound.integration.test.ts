/**
 * Integration tests verifying that first_time_event, performed_regularly,
 * event_sequence, and not_performed_event_sequence conditions respect the
 * upperBound (dateTo) and exclude post-dateTo events from cohort evaluation.
 *
 * Issue #524: all four conditions were missing `AND timestamp <= upperBound`,
 * which caused post-period events to produce false cohort hits.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  msAgo,
  DAY_MS,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { buildCohortSubquery } from '@qurvo/cohort-query';
import { toChTs } from '../../utils/clickhouse-helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/**
 * Helper: counts unique persons in a subquery built with a fixed dateTo.
 */
async function countWithDateTo(
  subquery: string,
  params: Record<string, unknown>,
): Promise<number> {
  const result = await ctx.ch.query({
    query: `SELECT uniqExact(person_id) AS cnt FROM (${subquery})`,
    query_params: params,
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}

// ── first_time_event upperBound ───────────────────────────────────────────────

describe('first_time_event — timestamp <= upperBound', () => {
  it('excludes person whose only first-time event is after dateTo', async () => {
    const projectId = randomUUID();
    const futureUser = randomUUID(); // first event is AFTER the dateTo cutoff
    const earlyUser  = randomUUID(); // first event is within the window

    // dateTo = 5 days ago. futureUser's first event is 1 day ago (after cutoff).
    // earlyUser's first event is 6 days ago (within the 7-day window ending at dateTo=5d ago).
    // [dateTo - 7d, dateTo] = [12d ago, 5d ago]. earlyUser at 6d ago is within that range.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: futureUser,
        distinct_id: 'future',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS), // 1 day ago — after dateTo (5 days ago)
      }),
      buildEvent({
        project_id: projectId,
        person_id: earlyUser,
        distinct_id: 'early',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(6 * DAY_MS), // 6 days ago — within [dateTo-7d, dateTo] = [12d, 5d]
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // 5 days ago as cutoff
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{ type: 'first_time_event', event_name: 'signup', time_window_days: 7 }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // futureUser's event is after dateTo → must be excluded
    // earlyUser's first event is within [dateTo - 7d, dateTo] → included
    expect(count).toBe(1);
  });

  it('post-dateTo event does not affect first_time_event HAVING min(timestamp)', async () => {
    const projectId = randomUUID();
    const oldUser = randomUUID(); // first event 20 days ago — outside 7-day window before dateTo
    // oldUser also has a post-dateTo event — without the fix it would affect min(timestamp)
    // evaluation because min() would see all events including future ones. But the fix
    // adds AND timestamp <= upperBound, so post-dateTo events are excluded from the scan.

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: oldUser,
        distinct_id: 'old',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(20 * DAY_MS), // 20 days ago — before window
      }),
      buildEvent({
        project_id: projectId,
        person_id: oldUser,
        distinct_id: 'old',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS), // 1 day ago — AFTER dateTo
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{ type: 'first_time_event', event_name: 'signup', time_window_days: 7 }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // Without the fix: the post-dateTo event (1 day ago) would become the min(timestamp)
    // within the range [dateTo - 7d, dateTo], potentially matching the HAVING clause.
    // With the fix: only events <= dateTo are scanned; the true first event is 20 days ago
    // which is before [dateTo - 7d], so oldUser is excluded.
    expect(count).toBe(0);
  });
});

// ── performed_regularly upperBound ───────────────────────────────────────────

describe('performed_regularly — timestamp <= upperBound', () => {
  it('excludes person who only reaches min_periods threshold via post-dateTo events', async () => {
    const projectId = randomUUID();
    const borderUser = randomUUID(); // 1 event within window, 1 post-dateTo (needs 2)

    // dateTo = 5 days ago. Window = 14 days. min_periods = 2 distinct days.
    // borderUser has 1 event 4 days ago (after dateTo, excluded) and 1 event 10 days ago (within).
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: borderUser,
        distinct_id: 'border',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(10 * DAY_MS), // 10 days ago — within [dateTo - 14d, dateTo]
      }),
      buildEvent({
        project_id: projectId,
        person_id: borderUser,
        distinct_id: 'border',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS), // 1 day ago — AFTER dateTo (5 days ago)
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'performed_regularly',
          event_name: 'login',
          period_type: 'day',
          total_periods: 14,
          min_periods: 2, // needs 2 distinct days
          time_window_days: 14,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // Without the fix: both events counted → 2 distinct days >= 2 → included (false hit)
    // With the fix: post-dateTo event excluded → 1 distinct day < 2 → excluded
    expect(count).toBe(0);
  });

  it('includes person with sufficient events entirely within the dateTo window', async () => {
    const projectId = randomUUID();
    const regularUser = randomUUID();

    // dateTo = 5 days ago. 3 events at 6, 8, 10 days ago — all within [dateTo - 14d, dateTo].
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: regularUser,
        distinct_id: 'regular',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(10 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: regularUser,
        distinct_id: 'regular',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(8 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: regularUser,
        distinct_id: 'regular',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(6 * DAY_MS),
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'performed_regularly',
          event_name: 'session',
          period_type: 'day',
          total_periods: 14,
          min_periods: 3,
          time_window_days: 14,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // All 3 events are within [dateTo - 14d, dateTo] → 3 distinct days >= 3 → included
    expect(count).toBe(1);
  });
});

// ── event_sequence upperBound ────────────────────────────────────────────────

describe('event_sequence — timestamp <= upperBound', () => {
  it('excludes person who only completes sequence via post-dateTo events', async () => {
    const projectId = randomUUID();
    const futureCompleter = randomUUID(); // view within window, purchase after dateTo

    // dateTo = 5 days ago. Window = 30 days.
    // view at 10 days ago (within window), purchase at 1 day ago (after dateTo).
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: futureCompleter,
        distinct_id: 'future-complete',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(10 * DAY_MS), // within window
      }),
      buildEvent({
        project_id: projectId,
        person_id: futureCompleter,
        distinct_id: 'future-complete',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS), // AFTER dateTo
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // Without the fix: purchase (post-dateTo) is included in the sequence scan → false hit
    // With the fix: only events <= dateTo scanned → purchase excluded → sequence incomplete
    expect(count).toBe(0);
  });

  it('includes person who completed sequence before dateTo', async () => {
    const projectId = randomUUID();
    const completedUser = randomUUID();

    // Both events before dateTo (5 days ago): view at 12d, purchase at 8d.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: completedUser,
        distinct_id: 'completed',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(12 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: completedUser,
        distinct_id: 'completed',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(8 * DAY_MS),
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // Both events are within [dateTo - 30d, dateTo] and in order → sequence matched → included
    expect(count).toBe(1);
  });
});

// ── not_performed_event_sequence upperBound ───────────────────────────────────

describe('not_performed_event_sequence — timestamp <= upperBound', () => {
  it('person who completed sequence after dateTo is incorrectly excluded without fix', async () => {
    const projectId = randomUUID();
    const futureCompleter = randomUUID(); // view within window, purchase after dateTo

    // dateTo = 5 days ago.
    // view at 10 days ago (within window), purchase at 1 day ago (after dateTo).
    // With the fix: purchase is excluded from the scan → sequence is incomplete → seq_match=0 → person included
    // Without the fix: purchase would be included → seq_match=1 → person excluded (false negative)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: futureCompleter,
        distinct_id: 'future-buyer',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(10 * DAY_MS), // within window
      }),
      buildEvent({
        project_id: projectId,
        person_id: futureCompleter,
        distinct_id: 'future-buyer',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(1 * DAY_MS), // AFTER dateTo
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // With the fix: purchase (post-dateTo) excluded → sequence NOT completed as of dateTo
    // → seq_match=0 → person is included in the "not performed" cohort
    expect(count).toBe(1);
  });

  it('excludes person who completed sequence before dateTo', async () => {
    const projectId = randomUUID();
    const beforeDateToCompleter = randomUUID(); // both events before dateTo

    // dateTo = 5 days ago. view at 12d, purchase at 8d — both before dateTo.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: beforeDateToCompleter,
        distinct_id: 'converted',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(12 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: beforeDateToCompleter,
        distinct_id: 'converted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(8 * DAY_MS),
      }),
    ]);

    const dateTo = toChTs(msAgo(5 * DAY_MS)); // dateTo = 5 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
    );

    const count = await countWithDateTo(subquery, params);
    // Both events within window and sequence is completed → seq_match=1 → excluded from "not performed"
    expect(count).toBe(0);
  });
});

// ── not_performed_event_sequence — dateFrom lower-bound fix ───────────────────
//
// Issue #562: not_performed_event_sequence was using only the rolling window
// [dateTo - N days, dateTo], so users who completed the sequence *before*
// dateFrom (outside the analysis period) were falsely excluded.
// The fix mirrors not-performed.ts: when dateFrom+dateTo are provided, the
// absence check is scoped to [dateFrom, dateTo] instead.

describe('not_performed_event_sequence — dateFrom lower-bound fix', () => {
  it('does NOT exclude a person who completed the sequence before dateFrom', async () => {
    const projectId = randomUUID();
    const preWindowCompleter = randomUUID(); // completed sequence BEFORE dateFrom

    // Analysis window: dateFrom = 30 days ago, dateTo = 1 day ago
    // Cohort condition: "did NOT perform product_view → purchase in last 90 days"
    // Rolling window would be [dateTo - 90d, dateTo] = [91d ago, 1d ago],
    // which reaches before dateFrom (30d ago) and would falsely exclude this user.
    // Fixed window: [dateFrom, dateTo] = [30d ago, 1d ago] — user has no events there → included ✓
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: preWindowCompleter,
        distinct_id: 'pre-window-buyer',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(60 * DAY_MS), // 60 days ago — BEFORE dateFrom (30d ago)
      }),
      buildEvent({
        project_id: projectId,
        person_id: preWindowCompleter,
        distinct_id: 'pre-window-buyer',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(55 * DAY_MS), // 55 days ago — BEFORE dateFrom (30d ago)
      }),
    ]);

    const dateTo = toChTs(msAgo(1 * DAY_MS));   // 1 day ago
    const dateFrom = toChTs(msAgo(30 * DAY_MS)); // 30 days ago
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 90,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
      dateFrom,
    );

    const count = await countWithDateTo(subquery, params);
    // User completed sequence 60→55 days ago, which is BEFORE dateFrom (30d ago).
    // The fixed window [dateFrom, dateTo] = [30d, 1d] contains no matching events.
    // → seq_match=0 → person IS included in "not performed" cohort
    expect(count).toBe(1);
  });

  it('still excludes a person who completed the sequence inside [dateFrom, dateTo]', async () => {
    const projectId = randomUUID();
    const inWindowCompleter = randomUUID(); // completed sequence within [dateFrom, dateTo]

    // Analysis window: dateFrom = 30 days ago, dateTo = 1 day ago
    // User performed view at 20d ago and purchase at 15d ago — both inside [dateFrom, dateTo].
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: inWindowCompleter,
        distinct_id: 'in-window-buyer',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(20 * DAY_MS), // 20d ago — inside [30d, 1d]
      }),
      buildEvent({
        project_id: projectId,
        person_id: inWindowCompleter,
        distinct_id: 'in-window-buyer',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(15 * DAY_MS), // 15d ago — inside [30d, 1d]
      }),
    ]);

    const dateTo = toChTs(msAgo(1 * DAY_MS));
    const dateFrom = toChTs(msAgo(30 * DAY_MS));
    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 90,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
      dateFrom,
    );

    const count = await countWithDateTo(subquery, params);
    // Sequence completed inside [dateFrom, dateTo] → seq_match=1 → excluded from "not performed"
    expect(count).toBe(0);
  });

  it('correctly handles mixed: one user before dateFrom (included), one inside window (excluded)', async () => {
    const projectId = randomUUID();
    const preWindowUser  = randomUUID(); // completed sequence before dateFrom → should be included
    const inWindowUser   = randomUUID(); // completed sequence inside analysis window → should be excluded

    const dateTo   = toChTs(msAgo(1 * DAY_MS));   // 1 day ago
    const dateFrom = toChTs(msAgo(30 * DAY_MS));  // 30 days ago

    await insertTestEvents(ctx.ch, [
      // preWindowUser: both steps before dateFrom
      buildEvent({
        project_id: projectId,
        person_id: preWindowUser,
        distinct_id: 'pre',
        event_name: 'add_to_cart',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(50 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: preWindowUser,
        distinct_id: 'pre',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(45 * DAY_MS),
      }),
      // inWindowUser: both steps inside [dateFrom, dateTo]
      buildEvent({
        project_id: projectId,
        person_id: inWindowUser,
        distinct_id: 'in',
        event_name: 'add_to_cart',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(25 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: inWindowUser,
        distinct_id: 'in',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(20 * DAY_MS),
      }),
    ]);

    const params: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(
      {
        type: 'AND',
        values: [{
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'add_to_cart' },
            { event_name: 'checkout' },
          ],
          time_window_days: 90,
        }],
      },
      0,
      'project_id',
      params,
      undefined,
      dateTo,
      dateFrom,
    );

    const count = await countWithDateTo(subquery, params);
    // preWindowUser: sequence before dateFrom → seq_match=0 in [dateFrom, dateTo] → included ✓
    // inWindowUser: sequence inside [dateFrom, dateTo] → seq_match=1 → excluded ✓
    // Expected: only preWindowUser included → count = 1
    expect(count).toBe(1);
  });
});
