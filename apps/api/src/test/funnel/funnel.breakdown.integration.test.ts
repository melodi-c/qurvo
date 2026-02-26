import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryFunnel — with breakdown', () => {
  it('segments funnel counts by a top-level property', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'chrome-user',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'chrome-user-2',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'firefox-user',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    expect(rBd.breakdown_property).toBe('browser');
    const chromeSteps = rBd.steps.filter((s) => s.breakdown_value === 'Chrome');
    const firefoxSteps = rBd.steps.filter((s) => s.breakdown_value === 'Firefox');
    expect(chromeSteps.find((s) => s.step === 1)?.count).toBe(2);
    expect(firefoxSteps.find((s) => s.step === 1)?.count).toBe(1);
    expect(rBd.aggregate_steps).toBeDefined();
    expect(rBd.aggregate_steps.find((s) => s.step === 1)?.count).toBe(3);
  });
});

// ── P1: Funnel order types ──────────────────────────────────────────────────

describe('queryFunnel — strict order', () => {
  it('requires events in strict consecutive order (no interleaved events)', async () => {
    const projectId = randomUUID();
    const personOk = randomUUID();
    const personBad = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Person OK: signup → checkout (no other events between)
      buildEvent({
        project_id: projectId,
        person_id: personOk,
        distinct_id: 'ok',
        event_name: 'signup',
        timestamp: msAgo(30000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOk,
        distinct_id: 'ok',
        event_name: 'checkout',
        timestamp: msAgo(20000),
      }),
      // Person Bad: signup → page_view → checkout (interleaved event breaks strict)
      buildEvent({
        project_id: projectId,
        person_id: personBad,
        distinct_id: 'bad',
        event_name: 'signup',
        timestamp: msAgo(30000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBad,
        distinct_id: 'bad',
        event_name: 'page_view',
        timestamp: msAgo(25000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBad,
        distinct_id: 'bad',
        event_name: 'checkout',
        timestamp: msAgo(20000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const rStrict = result as Extract<typeof result, { breakdown: false }>;
    expect(rStrict.steps[0].count).toBe(2); // both entered
    expect(rStrict.steps[1].count).toBe(1); // only personOk completes strict
  });
});

describe('queryFunnel — unordered', () => {
  it('counts users who did all steps in any order', async () => {
    const projectId = randomUUID();
    const personForward = randomUUID();
    const personReverse = randomUUID();
    const personPartial = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Forward: A → B → C
      buildEvent({
        project_id: projectId,
        person_id: personForward,
        distinct_id: 'fwd',
        event_name: 'step_a',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personForward,
        distinct_id: 'fwd',
        event_name: 'step_b',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personForward,
        distinct_id: 'fwd',
        event_name: 'step_c',
        timestamp: msAgo(1000),
      }),
      // Reverse: C → B → A (should still count as all 3 steps done)
      buildEvent({
        project_id: projectId,
        person_id: personReverse,
        distinct_id: 'rev',
        event_name: 'step_c',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReverse,
        distinct_id: 'rev',
        event_name: 'step_b',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReverse,
        distinct_id: 'rev',
        event_name: 'step_a',
        timestamp: msAgo(1000),
      }),
      // Partial: A → B only (missing C)
      buildEvent({
        project_id: projectId,
        person_id: personPartial,
        distinct_id: 'partial',
        event_name: 'step_a',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPartial,
        distinct_id: 'partial',
        event_name: 'step_b',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
        { event_name: 'step_c', label: 'C' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    const rUnord = result as Extract<typeof result, { breakdown: false }>;
    expect(rUnord.steps[0].count).toBe(3); // all 3 entered
    expect(rUnord.steps[1].count).toBe(3); // all 3 did at least 2 unique steps
    expect(rUnord.steps[2].count).toBe(2); // forward + reverse did all 3
  });
});
