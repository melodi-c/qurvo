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

// ── P2: Sampling ─────────────────────────────────────────────────────────────

describe('queryFunnel — sampling', () => {
  it('returns sampling_factor in result and deterministic per-user counts', async () => {
    const projectId = randomUUID();

    // Create 20 users who all complete step_a → step_b
    const events = [];
    for (let i = 0; i < 20; i++) {
      const pid = randomUUID();
      const did = `sample-user-${i}`;
      events.push(
        buildEvent({
          project_id: projectId,
          person_id: pid,
          distinct_id: did,
          event_name: 'step_a',
          timestamp: msAgo(3000 + i),
        }),
        buildEvent({
          project_id: projectId,
          person_id: pid,
          distinct_id: did,
          event_name: 'step_b',
          timestamp: msAgo(1000 + i),
        }),
      );
    }
    await insertTestEvents(ctx.ch, events);

    // Full query — no sampling
    const full = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(full.breakdown).toBe(false);
    const rFull = full as Extract<typeof full, { breakdown: false }>;
    expect(rFull.steps[0].count).toBe(20);
    expect(rFull.steps[1].count).toBe(20);
    expect(rFull.sampling_factor).toBeUndefined();

    // Sampled query — 50%
    const sampled = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      sampling_factor: 0.5,
    });

    expect(sampled.breakdown).toBe(false);
    const rSampled = sampled as Extract<typeof sampled, { breakdown: false }>;
    expect(rSampled.sampling_factor).toBe(0.5);
    // With 20 users and 50% sampling, we expect roughly 10 (±5 due to hash distribution)
    expect(rSampled.steps[0].count).toBeGreaterThan(0);
    expect(rSampled.steps[0].count).toBeLessThanOrEqual(20);
    // Conversion rate should remain 100% (all sampled users complete both steps)
    expect(rSampled.steps[1].conversion_rate).toBe(100);

    // Sampling is deterministic — same result on repeated call
    const sampled2 = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      sampling_factor: 0.5,
    });

    expect(sampled2.breakdown).toBe(false);
    const rSampled2 = sampled2 as Extract<typeof sampled2, { breakdown: false }>;
    expect(rSampled2.steps[0].count).toBe(rSampled.steps[0].count);
  });

  it('sampling_factor=1 returns same result as no sampling', async () => {
    const projectId = randomUUID();
    const pid = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user-1',
        event_name: 'step_a',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user-1',
        event_name: 'step_b',
        timestamp: msAgo(1000),
      }),
    ]);

    const params = {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    };

    const noSampling = await queryFunnel(ctx.ch, params);
    const factor1 = await queryFunnel(ctx.ch, { ...params, sampling_factor: 1 });

    expect(noSampling.breakdown).toBe(false);
    expect(factor1.breakdown).toBe(false);
    const rNo = noSampling as Extract<typeof noSampling, { breakdown: false }>;
    const rF1 = factor1 as Extract<typeof factor1, { breakdown: false }>;
    expect(rF1.steps[0].count).toBe(rNo.steps[0].count);
    expect(rF1.steps[1].count).toBe(rNo.steps[1].count);
  });
});
