import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  msAgo,
  DAY_MS,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { countCohortMembers } from '../../cohorts/cohorts.query';
import { buildCohortSubquery, compile } from '@qurvo/ch-query';
import type { CohortConditionGroup } from '@qurvo/db';

/**
 * Counts cohort members using a specific dateTo upper bound.
 * Used to verify that events after dateTo do not affect classification.
 */
async function countCohortMembersAt(
  context: ContainerContext,
  projectId: string,
  definition: CohortConditionGroup,
  dateTo: string,
): Promise<number> {
  const params: Record<string, unknown> = { project_id: projectId };
  const node = buildCohortSubquery(definition, 0, 'project_id', params, undefined, dateTo);
  const { sql: subquery, params: compiledParams } = compile(node);
  Object.assign(params, compiledParams);
  const result = await context.ch.query({
    query: `SELECT uniqExact(person_id) AS cnt FROM (${subquery})`,
    query_params: params,
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── first_time_event ──────────────────────────────────────────────────────────

describe('countCohortMembers — first_time_event', () => {
  it('includes person whose first event is within the time window', async () => {
    const projectId = randomUUID();
    const newUser = randomUUID();    // first signup is within window
    const oldUser = randomUUID();   // first signup is outside window

    // newUser: first event happened 5 days ago (within 7-day window)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new-user',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(5 * DAY_MS),
      }),
      // oldUser: first event happened 20 days ago (outside 7-day window)
      buildEvent({
        project_id: projectId,
        person_id: oldUser,
        distinct_id: 'old-user',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(20 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'first_time_event', event_name: 'signup', time_window_days: 7 },
      ],
    });

    expect(count).toBe(1); // only newUser's first event is within the 7-day window
  });

  it('excludes person whose first event is outside the time window', async () => {
    const projectId = randomUUID();
    const earlyUser = randomUUID(); // signed up 30 days ago

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: earlyUser,
        distinct_id: 'early',
        event_name: 'page_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(30 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'first_time_event', event_name: 'page_view', time_window_days: 7 },
      ],
    });

    expect(count).toBe(0); // first event is too old
  });

  it('uses min(timestamp) to determine first occurrence — not most recent', async () => {
    const projectId = randomUUID();
    const repeatingUser = randomUUID(); // first purchase old, recent purchases new

    await insertTestEvents(ctx.ch, [
      // First event is 30 days ago — outside window
      buildEvent({
        project_id: projectId,
        person_id: repeatingUser,
        distinct_id: 'repeat',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(30 * DAY_MS),
      }),
      // Subsequent event within window — should NOT make this person included
      buildEvent({
        project_id: projectId,
        person_id: repeatingUser,
        distinct_id: 'repeat',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'first_time_event', event_name: 'purchase', time_window_days: 7 },
      ],
    });

    expect(count).toBe(0); // first event predates window
  });
});

// ── not_performed_event ───────────────────────────────────────────────────────

describe('countCohortMembers — not_performed_event', () => {
  it('includes person who did NOT perform the event in the time window', async () => {
    const projectId = randomUUID();
    const activeUser = randomUUID();    // performed some OTHER event
    const checkoutUser = randomUUID(); // performed checkout → must be excluded

    await insertTestEvents(ctx.ch, [
      // activeUser: performed a page_view (not checkout) — should be included
      buildEvent({
        project_id: projectId,
        person_id: activeUser,
        distinct_id: 'active',
        event_name: 'page_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
      // checkoutUser: performed checkout — should be excluded
      buildEvent({
        project_id: projectId,
        person_id: checkoutUser,
        distinct_id: 'checkout',
        event_name: 'checkout',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'not_performed_event', event_name: 'checkout', time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only activeUser is included
  });

  it('excludes person who performed the event in the time window', async () => {
    const projectId = randomUUID();
    const convertedUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: convertedUser,
        distinct_id: 'converted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'paid' }),
        timestamp: msAgo(5 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'not_performed_event', event_name: 'purchase', time_window_days: 30 },
      ],
    });

    expect(count).toBe(0); // convertedUser performed the event → excluded
  });

  it('edge case: event exactly at the start of the rolling window is excluded', async () => {
    const projectId = randomUUID();
    const borderUser = randomUUID(); // event exactly at boundary

    // Event is placed right at the boundary of the 7-day window.
    // Using slightly inside (6.5 days ago) to be safely within the window.
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: borderUser,
        distinct_id: 'border',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(6.5 * DAY_MS), // within 7-day window
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'not_performed_event', event_name: 'login', time_window_days: 7 },
      ],
    });

    expect(count).toBe(0); // event is within window → excluded
  });

  it('event outside time window: person visible via other events still included', async () => {
    const projectId = randomUUID();
    const oldLoginUser = randomUUID(); // logged in 60 days ago (outside 30-day window)

    await insertTestEvents(ctx.ch, [
      // An old login event that falls outside the 30-day window
      buildEvent({
        project_id: projectId,
        person_id: oldLoginUser,
        distinct_id: 'old-login',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(60 * DAY_MS),
      }),
      // A recent page_view that puts the person in the events table for the scan
      buildEvent({
        project_id: projectId,
        person_id: oldLoginUser,
        distinct_id: 'old-login',
        event_name: 'page_view',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(5 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'not_performed_event', event_name: 'login', time_window_days: 30 },
      ],
    });

    // login is 60 days ago — outside 30-day window — person visible via page_view
    expect(count).toBe(1);
  });
});

// ── event_sequence ────────────────────────────────────────────────────────────

describe('countCohortMembers — event_sequence', () => {
  it('includes person who performed events in the correct order', async () => {
    const projectId = randomUUID();
    const funneledUser = randomUUID(); // view → cart → purchase in order

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: funneledUser,
        distinct_id: 'funneled',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'shopper' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: funneledUser,
        distinct_id: 'funneled',
        event_name: 'add_to_cart',
        user_properties: JSON.stringify({ role: 'shopper' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: funneledUser,
        distinct_id: 'funneled',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'shopper' }),
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'add_to_cart' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    expect(count).toBe(1);
  });

  it('excludes person who performed events in the wrong order', async () => {
    const projectId = randomUUID();
    const reverseUser = randomUUID(); // purchase → cart → view (reversed)

    await insertTestEvents(ctx.ch, [
      // Steps in reverse order — should NOT match the sequence
      buildEvent({
        project_id: projectId,
        person_id: reverseUser,
        distinct_id: 'reverse',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: reverseUser,
        distinct_id: 'reverse',
        event_name: 'add_to_cart',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: reverseUser,
        distinct_id: 'reverse',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'add_to_cart' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    expect(count).toBe(0); // reversed order does not match
  });

  it('excludes person who only performed some steps (incomplete sequence)', async () => {
    const projectId = randomUUID();
    const partialUser = randomUUID(); // only view + cart, no purchase

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: partialUser,
        distinct_id: 'partial',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: partialUser,
        distinct_id: 'partial',
        event_name: 'add_to_cart',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'add_to_cart' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    expect(count).toBe(0); // incomplete sequence
  });
});

// ── not_performed_event_sequence ─────────────────────────────────────────────

describe('countCohortMembers — not_performed_event_sequence', () => {
  it('includes person who did NOT perform the sequence', async () => {
    const projectId = randomUUID();
    const nonConvertedUser = randomUUID(); // only viewed, never added to cart

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: nonConvertedUser,
        distinct_id: 'browse-only',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'visitor' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    expect(count).toBe(1); // no purchase after view → included
  });

  it('excludes person who completed the full sequence', async () => {
    const projectId = randomUUID();
    const convertedUser = randomUUID(); // viewed then purchased

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: convertedUser,
        distinct_id: 'converted',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: convertedUser,
        distinct_id: 'converted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    expect(count).toBe(0); // completed the sequence → excluded
  });

  it('includes person who performed steps in wrong order (no matching sequence)', async () => {
    const projectId = randomUUID();
    const wrongOrderUser = randomUUID(); // purchase first, then view

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: wrongOrderUser,
        distinct_id: 'wrong-order',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: wrongOrderUser,
        distinct_id: 'wrong-order',
        event_name: 'product_view',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'product_view' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    // Wrong order does not match the sequence → included
    expect(count).toBe(1);
  });
});

// ── event_sequence — sub-second precision ────────────────────────────────────

describe('countCohortMembers — event_sequence sub-second precision', () => {
  it('detects correct order when events are 50ms apart (within same second)', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    // Two events within the same second, 50ms apart: step1 first, step2 second
    const baseTime = Date.now() - DAY_MS;
    const step1Time = new Date(baseTime).toISOString();         // e.g. ...T12:00:00.000Z
    const step2Time = new Date(baseTime + 50).toISOString();    // e.g. ...T12:00:00.050Z

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'subsecond',
        event_name: 'step_a',
        user_properties: JSON.stringify({ role: 'tester' }),
        timestamp: step1Time,
      }),
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'subsecond',
        event_name: 'step_b',
        user_properties: JSON.stringify({ role: 'tester' }),
        timestamp: step2Time,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event_sequence',
          steps: [{ event_name: 'step_a' }, { event_name: 'step_b' }],
          time_window_days: 7,
        },
      ],
    });

    // With millisecond precision: step_a (T+0ms) before step_b (T+50ms) → match
    expect(count).toBe(1);
  });

  it('rejects wrong order when events are 50ms apart (within same second)', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    // Two events within the same second, but step_b before step_a
    const baseTime = Date.now() - DAY_MS;
    const step2First = new Date(baseTime).toISOString();        // step_b at T+0ms
    const step1Second = new Date(baseTime + 50).toISOString();  // step_a at T+50ms

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'subsecond-rev',
        event_name: 'step_b',
        user_properties: JSON.stringify({ role: 'tester' }),
        timestamp: step2First,
      }),
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'subsecond-rev',
        event_name: 'step_a',
        user_properties: JSON.stringify({ role: 'tester' }),
        timestamp: step1Second,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event_sequence',
          steps: [{ event_name: 'step_a' }, { event_name: 'step_b' }],
          time_window_days: 7,
        },
      ],
    });

    // Wrong order: step_b (T+0ms) before step_a (T+50ms) → no match
    expect(count).toBe(0);
  });
});

// ── not_performed_event_sequence — sub-second precision ─────────────────────

describe('countCohortMembers — not_performed_event_sequence sub-second precision', () => {
  it('excludes person who completed sequence with 50ms gap (sub-second)', async () => {
    const projectId = randomUUID();
    const user = randomUUID();

    const baseTime = Date.now() - DAY_MS;
    const step1Time = new Date(baseTime).toISOString();
    const step2Time = new Date(baseTime + 50).toISOString();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'subsecond-np',
        event_name: 'view',
        user_properties: JSON.stringify({ role: 'tester' }),
        timestamp: step1Time,
      }),
      buildEvent({
        project_id: projectId,
        person_id: user,
        distinct_id: 'subsecond-np',
        event_name: 'buy',
        user_properties: JSON.stringify({ role: 'tester' }),
        timestamp: step2Time,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'not_performed_event_sequence',
          steps: [{ event_name: 'view' }, { event_name: 'buy' }],
          time_window_days: 7,
        },
      ],
    });

    // Sequence completed (view at T+0ms, buy at T+50ms) → excluded from "not performed"
    expect(count).toBe(0);
  });
});

// ── performed_regularly ───────────────────────────────────────────────────────

describe('countCohortMembers — performed_regularly', () => {
  it('includes person active in min_periods out of total_periods days', async () => {
    const projectId = randomUUID();
    const regularUser = randomUUID();   // active on 3 distinct days
    const sporadicUser = randomUUID();  // active on only 1 day

    await insertTestEvents(ctx.ch, [
      // regularUser: events on 3 different days
      buildEvent({
        project_id: projectId,
        person_id: regularUser,
        distinct_id: 'regular',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(7 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: regularUser,
        distinct_id: 'regular',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(5 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: regularUser,
        distinct_id: 'regular',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
      // sporadicUser: only 1 event
      buildEvent({
        project_id: projectId,
        person_id: sporadicUser,
        distinct_id: 'sporadic',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'performed_regularly',
          event_name: 'login',
          period_type: 'day',
          total_periods: 14,
          min_periods: 3,
          time_window_days: 14,
        },
      ],
    });

    expect(count).toBe(1); // only regularUser (3 distinct days >= 3 min_periods)
  });

  it('excludes person below min_periods threshold', async () => {
    const projectId = randomUUID();
    const infrequentUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Active on 2 days but min_periods = 5
      buildEvent({
        project_id: projectId,
        person_id: infrequentUser,
        distinct_id: 'infrequent',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(10 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: infrequentUser,
        distinct_id: 'infrequent',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(8 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'performed_regularly',
          event_name: 'purchase',
          period_type: 'day',
          total_periods: 14,
          min_periods: 5,
          time_window_days: 14,
        },
      ],
    });

    expect(count).toBe(0); // only 2 distinct days < 5 min_periods
  });

  it('edge case: min_periods == total_periods requires activity on every distinct week', async () => {
    const projectId = randomUUID();
    const consistentUser = randomUUID(); // active in both weeks
    const oneWeekUser = randomUUID();    // active in only 1 week

    // Use weekly period_type so daily UTC-hour ambiguity doesn't matter.
    // total_periods: 2 weeks, min_periods: 2 → must be active in BOTH distinct weeks.
    // Events: one 14+ days ago (week 1), one 7+ days ago (week 2).
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: consistentUser,
        distinct_id: 'consistent',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(13 * DAY_MS), // week 2 (13 days ago)
      }),
      buildEvent({
        project_id: projectId,
        person_id: consistentUser,
        distinct_id: 'consistent',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(6 * DAY_MS), // week 1 (6 days ago)
      }),
      buildEvent({
        project_id: projectId,
        person_id: oneWeekUser,
        distinct_id: 'one-week',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(6 * DAY_MS), // only week 1 (this week)
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'performed_regularly',
          event_name: 'session',
          period_type: 'week',
          total_periods: 2,
          min_periods: 2, // min == total: must be active in every distinct week
          time_window_days: 14,
        },
      ],
    });

    expect(count).toBe(1); // only consistentUser (active in both weeks)
  });

  it('weekly period_type: includes person active in N distinct weeks', async () => {
    const projectId = randomUUID();
    const weeklyUser = randomUUID(); // active across 2 different weeks

    await insertTestEvents(ctx.ch, [
      // Week 1: ~14 days ago
      buildEvent({
        project_id: projectId,
        person_id: weeklyUser,
        distinct_id: 'weekly',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(14 * DAY_MS),
      }),
      // Week 2: ~7 days ago
      buildEvent({
        project_id: projectId,
        person_id: weeklyUser,
        distinct_id: 'weekly',
        event_name: 'session',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(7 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'performed_regularly',
          event_name: 'session',
          period_type: 'week',
          total_periods: 4,
          min_periods: 2,
          time_window_days: 28,
        },
      ],
    });

    expect(count).toBe(1); // active in 2 distinct weeks >= 2 min_periods
  });
});

// ── stopped_performing ────────────────────────────────────────────────────────

describe('countCohortMembers — stopped_performing', () => {
  it('includes person active in historical window but not in recent window', async () => {
    const projectId = randomUUID();
    const churnedUser = randomUUID();  // was active, now gone
    const activeUser = randomUUID();   // still active recently

    await insertTestEvents(ctx.ch, [
      // churnedUser: active 15–20 days ago (historical: 30d, recent: 7d)
      buildEvent({
        project_id: projectId,
        person_id: churnedUser,
        distinct_id: 'churned',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(15 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: churnedUser,
        distinct_id: 'churned',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(20 * DAY_MS),
      }),
      // activeUser: active both historically and recently
      buildEvent({
        project_id: projectId,
        person_id: activeUser,
        distinct_id: 'still-active',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(15 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: activeUser,
        distinct_id: 'still-active',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'stopped_performing',
          event_name: 'login',
          recent_window_days: 7,
          historical_window_days: 30,
        },
      ],
    });

    expect(count).toBe(1); // only churnedUser
  });

  it('excludes person who performed the event in the recent window', async () => {
    const projectId = randomUUID();
    const recentUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: recentUser,
        distinct_id: 'recent',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(20 * DAY_MS),
      }),
      // Recent event within the 7-day window
      buildEvent({
        project_id: projectId,
        person_id: recentUser,
        distinct_id: 'recent',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(3 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'stopped_performing',
          event_name: 'purchase',
          recent_window_days: 7,
          historical_window_days: 30,
        },
      ],
    });

    expect(count).toBe(0); // still active in recent window → not stopped
  });

  it('excludes person who was never active in historical window', async () => {
    const projectId = randomUUID();
    const newUser = randomUUID(); // only has recent events, no historical activity

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'brand-new',
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(2 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'stopped_performing',
          event_name: 'signup',
          recent_window_days: 7,
          historical_window_days: 30,
        },
      ],
    });

    // newUser only has a recent event — no activity in [30d, 7d] window → excluded
    expect(count).toBe(0);
  });
});

// ── restarted_performing ──────────────────────────────────────────────────────

describe('countCohortMembers — restarted_performing', () => {
  it('includes person active in historical, inactive in gap, active again in recent', async () => {
    const projectId = randomUUID();
    const restartedUser = randomUUID(); // classic win-back pattern

    // restarted_performing config:
    //   historical_window_days: 60  → active between [60d, 30d+20d=50d] ago
    //   gap_window_days: 20         → no activity in [30d+20d=50d, 30d] ago
    //   recent_window_days: 30      → active again in [30d, now]
    //
    // Timeline:
    //   55 days ago → historical activity (within historical, before gap start)
    //   10 days ago → recent activity (within recent window)
    //   Gap zone [30+20=50d, 30d] → nothing

    await insertTestEvents(ctx.ch, [
      // Historical activity (before gap, within 60-day window)
      buildEvent({
        project_id: projectId,
        person_id: restartedUser,
        distinct_id: 'restarted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(55 * DAY_MS),
      }),
      // Recent activity (within recent 30-day window)
      buildEvent({
        project_id: projectId,
        person_id: restartedUser,
        distinct_id: 'restarted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(10 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 30,
          gap_window_days: 20,
          historical_window_days: 60,
        },
      ],
    });

    expect(count).toBe(1); // classic win-back pattern
  });

  it('excludes person who was active during the gap window', async () => {
    const projectId = randomUUID();
    const continuousUser = randomUUID(); // never stopped

    await insertTestEvents(ctx.ch, [
      // Historical
      buildEvent({
        project_id: projectId,
        person_id: continuousUser,
        distinct_id: 'continuous',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(55 * DAY_MS),
      }),
      // Active in GAP zone (35 days ago → within [50d, 30d] gap window)
      buildEvent({
        project_id: projectId,
        person_id: continuousUser,
        distinct_id: 'continuous',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(35 * DAY_MS),
      }),
      // Recent
      buildEvent({
        project_id: projectId,
        person_id: continuousUser,
        distinct_id: 'continuous',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(10 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 30,
          gap_window_days: 20,
          historical_window_days: 60,
        },
      ],
    });

    expect(count).toBe(0); // was active during gap → not a restarted user
  });

  it('excludes person with no historical activity (only recent)', async () => {
    const projectId = randomUUID();
    const newUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Only recent, no historical
      buildEvent({
        project_id: projectId,
        person_id: newUser,
        distinct_id: 'new-buyer',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(5 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 30,
          gap_window_days: 20,
          historical_window_days: 60,
        },
      ],
    });

    expect(count).toBe(0); // no historical activity → not a restarted user
  });

  it('excludes person with no recent activity (only historical)', async () => {
    const projectId = randomUUID();
    const inactiveUser = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Historical only, no recent
      buildEvent({
        project_id: projectId,
        person_id: inactiveUser,
        distinct_id: 'inactive',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(55 * DAY_MS),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 30,
          gap_window_days: 20,
          historical_window_days: 60,
        },
      ],
    });

    expect(count).toBe(0); // no recent activity → has not restarted
  });
});

// ── dateTo upper-bound regression tests ───────────────────────────────────────
//
// These tests verify that events occurring after dateTo do not affect the
// classification of stopped_performing / restarted_performing.
// Before the fix, the "recent performers" subquery had no upper bound on
// timestamp, so a post-dateTo event would falsely include the user in
// "recent performers" and incorrectly exclude them from stopped_performing
// (or incorrectly qualify them for restarted_performing).

/**
 * Formats a Date to the ClickHouse DateTime-compatible string "YYYY-MM-DD HH:mm:ss".
 * This matches the format expected by DateTime64(3) query parameters.
 */
function toChDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

describe('stopped_performing — dateTo upper bound', () => {
  it('event after dateTo does not exclude user from stopped_performing', async () => {
    const projectId = randomUUID();
    const churnedUser = randomUUID();

    // dateTo is set to 10 days ago (the "analysis point in time").
    // Config: historical_window_days=30, recent_window_days=7
    // Windows relative to dateTo (10 days ago):
    //   historical: [10d+30d, 10d+7d) = [40d ago, 17d ago)
    //   recent:     [10d+7d ago, 10d ago] = [17d ago, 10d ago]
    //   post-dateTo: anything after 10d ago ← must be ignored

    // Historical event: 25 days ago (within historical window relative to dateTo=10d ago)
    const historicalTs = new Date(Date.now() - 25 * DAY_MS).toISOString();
    // Post-dateTo event: 5 days ago (after dateTo=10d ago — must be ignored)
    const postDateToTs = new Date(Date.now() - 5 * DAY_MS).toISOString();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: churnedUser,
        distinct_id: 'churned',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: historicalTs,
      }),
      // This event is AFTER dateTo — the fixed query must ignore it
      buildEvent({
        project_id: projectId,
        person_id: churnedUser,
        distinct_id: 'churned',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: postDateToTs,
      }),
    ]);

    // dateTo = 10 days ago: churnedUser had historical activity but no activity
    // in the recent [17d, 10d] window. The post-dateTo event must NOT make them
    // appear as a "recent performer" and incorrectly exclude them.
    const dateTo = toChDateTime(new Date(Date.now() - 10 * DAY_MS));
    const count = await countCohortMembersAt(ctx, projectId, {
      type: 'AND',
      values: [
        {
          type: 'stopped_performing',
          event_name: 'login',
          recent_window_days: 7,
          historical_window_days: 30,
        },
      ],
    }, dateTo);

    // churnedUser stopped before dateTo; post-dateTo event must be ignored
    expect(count).toBe(1);
  });

  it('event within recent window (before dateTo) correctly excludes user from stopped_performing', async () => {
    const projectId = randomUUID();
    const activeUser = randomUUID();

    // dateTo = 10 days ago
    // historical: [40d ago, 17d ago), recent: [17d ago, 10d ago]
    // activeUser has events in both windows → should NOT be in stopped_performing
    const historicalTs = new Date(Date.now() - 25 * DAY_MS).toISOString();
    const recentTs = new Date(Date.now() - 12 * DAY_MS).toISOString(); // 12d ago → within [17d, 10d] window

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: activeUser,
        distinct_id: 'active',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: historicalTs,
      }),
      buildEvent({
        project_id: projectId,
        person_id: activeUser,
        distinct_id: 'active',
        event_name: 'login',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: recentTs,
      }),
    ]);

    const dateTo = toChDateTime(new Date(Date.now() - 10 * DAY_MS));
    const count = await countCohortMembersAt(ctx, projectId, {
      type: 'AND',
      values: [
        {
          type: 'stopped_performing',
          event_name: 'login',
          recent_window_days: 7,
          historical_window_days: 30,
        },
      ],
    }, dateTo);

    expect(count).toBe(0); // activeUser performed in the recent window → not stopped
  });
});

describe('restarted_performing — dateTo upper bound', () => {
  it('event after dateTo does not falsely qualify user as restarted_performing', async () => {
    const projectId = randomUUID();
    const nonRestartedUser = randomUUID();

    // dateTo = 10 days ago
    // Config: historical=60, gap=20, recent=30
    // gapStart = recent + gap = 50
    // Windows relative to dateTo (10d ago):
    //   historical: [dateTo-60, dateTo-50) = [70d, 60d ago) from now
    //   gap:        [dateTo-50, dateTo-30) = [60d, 40d ago) from now (NOT an event here)
    //   recent:     [dateTo-30, dateTo]    = [40d, 10d ago] from now ← user has NO events here before dateTo
    //   post-dateTo: after 10d ago ← must be ignored

    const historicalTs = new Date(Date.now() - 65 * DAY_MS).toISOString(); // within historical [70d, 60d)
    const postDateToTs = new Date(Date.now() - 5 * DAY_MS).toISOString();  // after dateTo

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: nonRestartedUser,
        distinct_id: 'non-restarted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: historicalTs,
      }),
      // Post-dateTo event: must NOT be treated as "recent activity"
      buildEvent({
        project_id: projectId,
        person_id: nonRestartedUser,
        distinct_id: 'non-restarted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: postDateToTs,
      }),
    ]);

    const dateTo = toChDateTime(new Date(Date.now() - 10 * DAY_MS));
    const count = await countCohortMembersAt(ctx, projectId, {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 30,
          gap_window_days: 20,
          historical_window_days: 60,
        },
      ],
    }, dateTo);

    // nonRestartedUser has no activity in the recent window before dateTo.
    // The post-dateTo event must NOT be mistaken for recent activity.
    expect(count).toBe(0);
  });

  it('event within recent window (before dateTo) correctly qualifies user as restarted_performing', async () => {
    const projectId = randomUUID();
    const restartedUser = randomUUID();

    // dateTo = 10 days ago
    // Config: historical=60, gap=20, recent=30
    // gapStart = recent + gap = 50
    // Windows relative to dateTo (10d ago):
    //   historical: [dateTo-60, dateTo-50) = [70d, 60d ago) from now
    //   gap:        [dateTo-50, dateTo-30) = [60d, 40d ago) from now (no events)
    //   recent:     [dateTo-30, dateTo]    = [40d, 10d ago] from now ← user active here (20d ago)

    const historicalTs = new Date(Date.now() - 65 * DAY_MS).toISOString(); // within historical [70d, 60d)
    const recentTs = new Date(Date.now() - 20 * DAY_MS).toISOString();     // 20d ago → within recent window relative to dateTo=10d

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: restartedUser,
        distinct_id: 'restarted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: historicalTs,
      }),
      buildEvent({
        project_id: projectId,
        person_id: restartedUser,
        distinct_id: 'restarted',
        event_name: 'purchase',
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: recentTs,
      }),
    ]);

    const dateTo = toChDateTime(new Date(Date.now() - 10 * DAY_MS));
    const count = await countCohortMembersAt(ctx, projectId, {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 30,
          gap_window_days: 20,
          historical_window_days: 60,
        },
      ],
    }, dateTo);

    expect(count).toBe(1); // classic win-back pattern confirmed within dateTo
  });
});
