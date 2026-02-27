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

// ── Unordered funnel: step-0 is required for funnel entry ────────────────────
// Regression test for: users without step-0 event being incorrectly counted
// as funnel entrants in the unordered funnel.

describe('queryFunnel — unordered funnel requires step-0 for entry', () => {
  it('does NOT count a user with only step-1 and step-2 events as a funnel entrant', async () => {
    // Bug scenario: user has events for step-1 and step-2 but NOT step-0.
    // With the old anchor logic (trying all step arrays), this user got
    // anchor_ms = t1_ms, max_step = 2, and appeared in step-1 count.
    const projectId = randomUUID();
    const personNoStep0 = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Only step-1 and step-2 — no step-0 (signup)
      buildEvent({
        project_id: projectId,
        person_id: personNoStep0,
        distinct_id: 'no-step0',
        event_name: 'onboarding',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personNoStep0,
        distinct_id: 'no-step0',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'onboarding', label: 'Onboarding' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // User without step-0 must NOT appear in any step count
    expect(r.steps[0].count).toBe(0);
    expect(r.steps[1].count).toBe(0);
    expect(r.steps[2].count).toBe(0);
  });

  it('counts a user with step-0, step-1, and step-2 events as fully converted', async () => {
    // Control: normal user with all steps present
    const projectId = randomUUID();
    const personFull = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personFull,
        distinct_id: 'full-user',
        event_name: 'signup',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFull,
        distinct_id: 'full-user',
        event_name: 'onboarding',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFull,
        distinct_id: 'full-user',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'onboarding', label: 'Onboarding' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[2].count).toBe(1);
    expect(r.steps[2].conversion_rate).toBe(100);
  });

  it('correctly separates: user with step-0 enters, user without step-0 does not', async () => {
    // Two users in the same project:
    // personWithStep0: has signup + purchase → should enter funnel (step-0 count = 1)
    // personNoStep0: has only purchase → must NOT enter funnel (step-0 count remains 1)
    const projectId = randomUUID();
    const personWithStep0 = randomUUID();
    const personNoStep0 = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personWithStep0: step-0 + step-1
      buildEvent({
        project_id: projectId,
        person_id: personWithStep0,
        distinct_id: 'with-step0',
        event_name: 'signup',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithStep0,
        distinct_id: 'with-step0',
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
      // personNoStep0: only step-1 (no signup)
      buildEvent({
        project_id: projectId,
        person_id: personNoStep0,
        distinct_id: 'no-step0',
        event_name: 'purchase',
        timestamp: msAgo(1000),
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
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Only personWithStep0 should enter the funnel (1 entrant, not 2)
    expect(r.steps[0].count).toBe(1);
    // personWithStep0 also converts
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[1].conversion_rate).toBe(100);
  });

  it('2-step unordered: user with only step-1 (no step-0) is NOT counted as entered', async () => {
    // Minimal 2-step case mirroring the root-cause description in the issue:
    // t0_ms = 0 (no step-0), t1_ms > 0 → previously anchor_ms = t1_ms and
    // max_step = 1, causing the user to appear in step-1 count.
    const projectId = randomUUID();
    const personOnlyStep1 = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personOnlyStep1,
        distinct_id: 'only-step1',
        event_name: 'purchase',
        timestamp: msAgo(2000),
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
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // No entrants — the user without step-0 must not appear
    expect(r.steps[0].count).toBe(0);
    expect(r.steps[1].count).toBe(0);
  });
});
