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

// ── P1: Exclusion steps ─────────────────────────────────────────────────────

describe('queryFunnel — exclusion steps', () => {
  it('excludes users who performed an exclusion event between funnel steps', async () => {
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Clean: signup → purchase (no cancel between)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Excluded: signup → cancel → purchase
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'cancel',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
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
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const rExcl = result as Extract<typeof result, { breakdown: false }>;
    expect(rExcl.steps[0].count).toBe(1); // only clean user
    expect(rExcl.steps[1].count).toBe(1);
  });
});

// ── P1: Granular conversion window ──────────────────────────────────────────

describe('queryFunnel — conversion window units', () => {
  it('uses minute-based conversion window', async () => {
    const projectId = randomUUID();
    const personFast = randomUUID();
    const personSlow = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Fast: step_a → step_b within 30 seconds
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_a',
        timestamp: msAgo(60_000), // 60 sec ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_b',
        timestamp: msAgo(30_000), // 30 sec ago
      }),
      // Slow: step_a → step_b with 3 minutes gap
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_a',
        timestamp: msAgo(300_000), // 5 min ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_b',
        timestamp: msAgo(120_000), // 2 min ago
      }),
    ]);

    // 1-minute window: only fast user converts
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 1, // fallback
      conversion_window_value: 1,
      conversion_window_unit: 'minute',
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const rWin = result as Extract<typeof result, { breakdown: false }>;
    expect(rWin.steps[0].count).toBe(2); // both entered
    expect(rWin.steps[1].count).toBe(1); // only fast within 1 min
  });
});
