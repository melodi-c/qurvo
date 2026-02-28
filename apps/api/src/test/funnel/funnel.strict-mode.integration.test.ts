import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/**
 * Tests for strict mode funnel (funnel_order_type = 'strict').
 *
 * Strict mode uses windowFunnel('strict_order') which resets funnel progress
 * when any intervening event (not matching the next expected step) appears
 * between two funnel steps.
 *
 * The fix for issue #452: instead of scanning ALL events in the project,
 * we now pre-filter to users who have at least one funnel step event via
 * a subquery on distinct_id. This avoids the 10-100x overhead for projects
 * with high-volume non-funnel events (e.g. pageview, scroll) while preserving
 * correct strict_order semantics (non-step events for qualifying users are
 * still visible to windowFunnel).
 */
describe('queryFunnel — strict mode (funnel_order_type: strict)', () => {
  it('user WITHOUT intervening events between steps CONVERTS in strict mode', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-clean',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-clean',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[1].conversion_rate).toBe(100);
  });

  it('user WITH a non-funnel event between steps does NOT convert in strict mode', async () => {
    // strict_order resets when ANY intervening event appears between steps.
    // signup → pageview → purchase:  pageview interrupts the funnel → no conversion.
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-interrupted',
        event_name: 'signup',
        timestamp: msAgo(5000),
      }),
      // Intervening event — not a funnel step
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-interrupted',
        event_name: 'pageview',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-interrupted',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // User entered step 1 (signup)
    expect(r.steps[0].count).toBe(1);
    // pageview between signup and purchase resets strict_order — no conversion
    expect(r.steps[1].count).toBe(0);
  });

  it('ordered mode converts the same user with intervening event (confirms strict vs ordered difference)', async () => {
    // Same scenario as above but with ordered mode — should convert because
    // ordered mode doesn't reset on intervening events.
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-interrupted-ordered',
        event_name: 'signup',
        timestamp: msAgo(5000),
      }),
      // Intervening event — allowed in ordered mode
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-interrupted-ordered',
        event_name: 'pageview',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-interrupted-ordered',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'ordered',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1);
    // In ordered mode, pageview is ignored — user completes the funnel
    expect(r.steps[1].count).toBe(1);
  });

  it('user whose ONLY complete path has an intervening event does NOT convert in strict mode', async () => {
    // ClickHouse windowFunnel('strict_order') evaluates the entire user event sequence.
    // signup → pageview → signup → purchase: the pageview resets the funnel after the
    // first signup. The second signup starts a new attempt, but ClickHouse's windowFunnel
    // returns max_step = 1 for this sequence — the user does not reach step 2.
    // This test documents the actual ClickHouse strict_order behaviour.
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-reentry',
        event_name: 'signup',
        timestamp: new Date(now - 10_000).toISOString(),
      }),
      // pageview interrupts after first signup
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-reentry',
        event_name: 'pageview',
        timestamp: new Date(now - 8_000).toISOString(),
      }),
      // second signup attempt
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-reentry',
        event_name: 'signup',
        timestamp: new Date(now - 6_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-reentry',
        event_name: 'purchase',
        timestamp: new Date(now - 4_000).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // User entered at step 1 (has signup events → passes subquery user filter)
    expect(r.steps[0].count).toBe(1);
    // ClickHouse strict_order: the pageview after the first signup resets progress.
    // windowFunnel returns max_step = 1 for this entire sequence → no step 2 conversion.
    expect(r.steps[1].count).toBe(0);
  });

  it('user with high-volume non-funnel events is correctly excluded in strict mode', async () => {
    // This is the performance regression scenario from issue #452.
    // A project with many pageview/scroll/click events plus a single funnel user.
    // The funnel user has a pageview between signup and purchase — strict mode should NOT convert them.
    // Non-funnel users (pageview-only) should not appear in the funnel.
    const projectId = randomUUID();
    const funnelUserInterrupted = randomUUID();
    const funnelUserClean = randomUUID();
    const nonFunnelUser1 = randomUUID();
    const nonFunnelUser2 = randomUUID();

    await insertTestEvents(ctx.ch, [
      // funnelUserInterrupted: signup → pageview (interrupts) → purchase
      buildEvent({
        project_id: projectId,
        person_id: funnelUserInterrupted,
        distinct_id: 'funnel-interrupted',
        event_name: 'signup',
        timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: funnelUserInterrupted,
        distinct_id: 'funnel-interrupted',
        event_name: 'pageview',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: funnelUserInterrupted,
        distinct_id: 'funnel-interrupted',
        event_name: 'purchase',
        timestamp: msAgo(3000),
      }),

      // funnelUserClean: signup → purchase (no interruption)
      buildEvent({
        project_id: projectId,
        person_id: funnelUserClean,
        distinct_id: 'funnel-clean',
        event_name: 'signup',
        timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: funnelUserClean,
        distinct_id: 'funnel-clean',
        event_name: 'purchase',
        timestamp: msAgo(4000),
      }),

      // nonFunnelUser1: only pageviews — never enters funnel
      buildEvent({
        project_id: projectId,
        person_id: nonFunnelUser1,
        distinct_id: 'pageview-only-1',
        event_name: 'pageview',
        timestamp: msAgo(7000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: nonFunnelUser1,
        distinct_id: 'pageview-only-1',
        event_name: 'pageview',
        timestamp: msAgo(5000),
      }),

      // nonFunnelUser2: click events only — never enters funnel
      buildEvent({
        project_id: projectId,
        person_id: nonFunnelUser2,
        distinct_id: 'click-only-1',
        event_name: 'click',
        timestamp: msAgo(6000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only the 2 funnel users enter (they have signup events); non-funnel users are excluded
    expect(r.steps[0].count).toBe(2);
    // Only funnelUserClean converts (no interruption); funnelUserInterrupted has pageview between steps
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[1].conversion_rate).toBe(50);
  });

  it('strict + exclusion: excludes user who performed exclusion event between steps (no intervening events)', async () => {
    // Combines strict mode with exclusion steps.
    // personClean: signup → purchase (no cancel, no intervening events) → converts
    // personExcluded: signup → cancel → purchase
    //   In strict mode, cancel between signup and purchase ALSO resets the funnel
    //   (strict_order resets on any intervening non-step event). So the user both
    //   fails strict and gets excluded. Either way: does not convert.
    // personStrictFail: signup → pageview → purchase (strict fail, no exclusion event)
    //   Strict_order resets on pageview → does not convert. Not excluded by cancel exclusion.
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();
    const personStrictFail = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personClean: clean strict path
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'strict-excl-clean',
        event_name: 'signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'strict-excl-clean',
        event_name: 'purchase',
        timestamp: msAgo(3000),
      }),
      // personExcluded: cancel between steps (both strict-fail AND exclusion)
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'strict-excl-excluded',
        event_name: 'signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'strict-excl-excluded',
        event_name: 'cancel',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'strict-excl-excluded',
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
      // personStrictFail: pageview between steps (strict fail only, not excluded by cancel)
      buildEvent({
        project_id: projectId,
        person_id: personStrictFail,
        distinct_id: 'strict-excl-strictfail',
        event_name: 'signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personStrictFail,
        distinct_id: 'strict-excl-strictfail',
        event_name: 'pageview',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personStrictFail,
        distinct_id: 'strict-excl-strictfail',
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personExcluded is excluded by the cancel exclusion (removed from all steps)
    // personStrictFail entered signup but fails strict (pageview interrupts), not excluded by exclusion
    // personClean converts
    expect(r.steps[0].count).toBe(2); // personClean + personStrictFail (personExcluded excluded from all steps)
    expect(r.steps[1].count).toBe(1); // only personClean converts (personStrictFail fails strict)
  });

  it('3-step strict funnel: user with interruption between steps 2 and 3 stops at step 2', async () => {
    // A→B→C→D funnel in strict mode.
    // personA: A → B → C (clean, no interruption) — full conversion
    // personB: A → B → X → C (X is not a funnel event → B→C is interrupted) — reaches step 2
    // personC: A → X → B → C (X between A and B → A→B interrupted) — reaches step 1
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: clean A → B → C
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'strict-a',
        event_name: 'step_a',
        timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'strict-a',
        event_name: 'step_b',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'strict-a',
        event_name: 'step_c',
        timestamp: msAgo(3000),
      }),

      // personB: A → B → X (interrupts B→C) → C: max_step = 2
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'strict-b',
        event_name: 'step_a',
        timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'strict-b',
        event_name: 'step_b',
        timestamp: msAgo(7000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'strict-b',
        event_name: 'other_event',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'strict-b',
        event_name: 'step_c',
        timestamp: msAgo(3000),
      }),

      // personC: A → X (interrupts A→B) → B → C: max_step = 1
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'strict-c',
        event_name: 'step_a',
        timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'strict-c',
        event_name: 'other_event',
        timestamp: msAgo(7000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'strict-c',
        event_name: 'step_b',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'strict-c',
        event_name: 'step_c',
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
        { event_name: 'step_c', label: 'Step C' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // All 3 users entered step A (have step_a events → pass the distinct_id subquery filter)
    expect(r.steps[0].count).toBe(3);
    // personA and personB reach step B (personB: A→B succeeded before interruption)
    expect(r.steps[1].count).toBe(2);
    // Only personA reaches step C (personB interrupted between B and C)
    expect(r.steps[2].count).toBe(1);
  });
});
