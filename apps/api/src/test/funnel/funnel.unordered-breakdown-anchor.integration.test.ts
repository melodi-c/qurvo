import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── Regression: unordered funnel breakdown attribution to the winning anchor ──
//
// Issue #520: argMinIf picked breakdown_value from the globally earliest step-0,
// ignoring which step-0 was the actual winning anchor. This test ensures that
// when a user's earlier step-0 attempt fails (out of window) and a later one
// succeeds, the breakdown_value comes from the *later* (winning) step-0.

describe('queryFunnel — unordered breakdown_value attributed to winning anchor step-0', () => {
  it('attributes breakdown_value to the step-0 of the successful attempt, not the earliest', async () => {
    // Scenario (7-day window):
    //   T-10d: step-0 with browser='Chrome' — attempt 1 anchor (will fail)
    //   T:     step-1 — 10 days after T-10d → outside 7-day window for attempt 1
    //   T-2d:  step-0 with browser='Firefox' — attempt 2 anchor (succeeds)
    //   T:     step-1 — 2 days after T-2d → inside 7-day window → conversion!
    //
    // Old (buggy): breakdown_value = 'Chrome' (earliest step-0)
    // Fixed:       breakdown_value = 'Firefox' (winning anchor step-0)
    const projectId = randomUUID();
    const personRetry = randomUUID();

    const now = Date.now();
    const stepOneTime = now;
    const secondAttempt = stepOneTime - 2 * DAY_MS;  // 2 days before step-1 (wins)
    const firstAttempt = stepOneTime - 10 * DAY_MS;  // 10 days before step-1 (fails)

    await insertTestEvents(ctx.ch, [
      // First attempt: step-0 with Chrome (will be outside the 7-day window)
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry-user',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: new Date(firstAttempt).toISOString(),
      }),
      // Second attempt: step-0 with Firefox (2d before step-1, within window)
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry-user',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: new Date(secondAttempt).toISOString(),
      }),
      // step-1: purchase
      buildEvent({
        project_id: projectId,
        person_id: personRetry,
        distinct_id: 'retry-user',
        event_name: 'purchase',
        timestamp: new Date(stepOneTime).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-15),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // User must be counted as converted
    const firefoxStep1 = rBd.steps.find((s) => s.breakdown_value === 'Firefox' && s.step === 1);
    const firefoxStep2 = rBd.steps.find((s) => s.breakdown_value === 'Firefox' && s.step === 2);
    expect(firefoxStep1?.count).toBe(1); // 1 user entered under Firefox
    expect(firefoxStep2?.count).toBe(1); // 1 user converted under Firefox

    // Chrome must NOT be the attributed group for this conversion
    const chromeStep2 = rBd.steps.find((s) => s.breakdown_value === 'Chrome' && s.step === 2);
    // Chrome step-2 should be absent or 0 (old bug: it would have been 1)
    expect(chromeStep2?.count ?? 0).toBe(0);
  });

  it('correctly handles two users: one converts under Chrome, one under Firefox', async () => {
    // Both users have an early failed attempt and a later successful one,
    // but the successful attempt uses different browsers.
    //
    // userA:
    //   T-12d: step-0 with browser='Chrome' (attempt 1, fails)
    //   T-2d:  step-0 with browser='Firefox' (attempt 2, succeeds)
    //   T:     step-1
    //   → should be attributed to 'Firefox'
    //
    // userB:
    //   T-12d: step-0 with browser='Firefox' (attempt 1, fails)
    //   T-3d:  step-0 with browser='Chrome' (attempt 2, succeeds)
    //   T:     step-1
    //   → should be attributed to 'Chrome'
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    const now = Date.now();
    const stepOneTime = now;

    await insertTestEvents(ctx.ch, [
      // userA: first attempt with Chrome (fails), second with Firefox (succeeds)
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: new Date(stepOneTime - 12 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: new Date(stepOneTime - 2 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        timestamp: new Date(stepOneTime).toISOString(),
      }),
      // userB: first attempt with Firefox (fails), second with Chrome (succeeds)
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: new Date(stepOneTime - 12 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: new Date(stepOneTime - 3 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        timestamp: new Date(stepOneTime).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-15),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // Firefox: 1 conversion (userA)
    const firefoxStep2 = rBd.steps.find((s) => s.breakdown_value === 'Firefox' && s.step === 2);
    expect(firefoxStep2?.count).toBe(1);

    // Chrome: 1 conversion (userB)
    const chromeStep2 = rBd.steps.find((s) => s.breakdown_value === 'Chrome' && s.step === 2);
    expect(chromeStep2?.count).toBe(1);
  });

  it('single-attempt user: breakdown_value still works correctly', async () => {
    // Sanity check: a user with a single step-0 attempt should still get the
    // correct breakdown_value (the fix must not break the common case).
    const projectId = randomUUID();
    const userChrome = randomUUID();
    const userFirefox = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: userChrome,
        distinct_id: 'chrome-single',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: new Date(now - 2 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userChrome,
        distinct_id: 'chrome-single',
        event_name: 'purchase',
        timestamp: new Date(now).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userFirefox,
        distinct_id: 'firefox-single',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: new Date(now - 3 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: userFirefox,
        distinct_id: 'firefox-single',
        event_name: 'purchase',
        timestamp: new Date(now).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-7),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const chromeStep2 = rBd.steps.find((s) => s.breakdown_value === 'Chrome' && s.step === 2);
    const firefoxStep2 = rBd.steps.find((s) => s.breakdown_value === 'Firefox' && s.step === 2);

    expect(chromeStep2?.count).toBe(1);
    expect(firefoxStep2?.count).toBe(1);
  });
});
