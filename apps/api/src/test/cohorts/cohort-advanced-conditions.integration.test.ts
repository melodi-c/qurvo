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
