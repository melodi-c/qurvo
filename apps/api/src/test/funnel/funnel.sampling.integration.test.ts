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
    // With 20 users and 50% sampling, we expect roughly 10 (±5 due to hash distribution).
    // The upper bound is 15 (not 20) to ensure sampling actually reduced the count — if
    // sampling were not applied, all 20 users would appear and this assertion would fail.
    expect(rSampled.steps[0].count).toBeGreaterThan(0);
    expect(rSampled.steps[0].count).toBeLessThanOrEqual(15);
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

  it('person with multiple distinct_ids is included or excluded as a whole unit', async () => {
    // Regression for: sampling by distinct_id splits merged users across the hash boundary.
    // A user who did step_a as anon-xxx and step_b as identified-yyy could get:
    //   sipHash64('anon-xxx') % 100 = in-sample, but sipHash64('identified-yyy') % 100 = out
    // which means only step_a events pass the filter — conversion rate drops incorrectly.
    //
    // Fix: sample by sipHash64(toString(person_id)) so the same person_id maps to the same
    // hash bucket regardless of which distinct_id emitted a given event.
    const projectId = randomUUID();

    // Build 20 "merged" users: each has two distinct_ids sharing one person_id.
    // step_a is done with distinct_id `anon-<i>`, step_b with `user-<i>`.
    // Both events share the same person_id, simulating post-login identity merge.
    const events = [];
    const personIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const personId = randomUUID();
      personIds.push(personId);
      events.push(
        buildEvent({
          project_id: projectId,
          person_id: personId,
          distinct_id: `anon-merge-${i}`,
          event_name: 'step_a',
          timestamp: msAgo(4000 + i),
        }),
        buildEvent({
          project_id: projectId,
          person_id: personId,
          distinct_id: `user-merge-${i}`,
          event_name: 'step_b',
          timestamp: msAgo(2000 + i),
        }),
      );
    }
    await insertTestEvents(ctx.ch, events);

    const baseParams = {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    };

    // Full scan confirms 20 users, 100% conversion
    const full = await queryFunnel(ctx.ch, baseParams);
    expect(full.breakdown).toBe(false);
    const rFull = full as Extract<typeof full, { breakdown: false }>;
    expect(rFull.steps[0].count).toBe(20);
    expect(rFull.steps[1].count).toBe(20);

    // 50% sampling: each person_id deterministically falls in or out of the sample.
    // Regardless of how many distinct_ids the user had, all their events either pass
    // or all are filtered — so conversion rate must remain 100%.
    const sampled = await queryFunnel(ctx.ch, { ...baseParams, sampling_factor: 0.5 });
    expect(sampled.breakdown).toBe(false);
    const rSampled = sampled as Extract<typeof sampled, { breakdown: false }>;
    expect(rSampled.sampling_factor).toBe(0.5);
    // Some users were sampled (at least 1)
    expect(rSampled.steps[0].count).toBeGreaterThan(0);
    // Conversion must be 100%: every sampled user has both steps (because both share person_id)
    expect(rSampled.steps[1].conversion_rate).toBe(100);
    // The count entering step_b equals those entering step_a (no partial split)
    expect(rSampled.steps[1].count).toBe(rSampled.steps[0].count);
  });

  it('sampling_factor=0 returns empty result (not a full scan)', async () => {
    // Regression for: `!samplingFactor` was true for 0, so sampling_factor=0 was silently
    // treated as "no sampling", returning all events instead of an empty result.
    const projectId = randomUUID();
    const pid = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'zero-sample-user',
        event_name: 'step_a',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'zero-sample-user',
        event_name: 'step_b',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      sampling_factor: 0,
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // 0% sample: funnel_per_user has no rows, so CROSS JOIN returns no rows either.
    // The result is an empty steps array — not the full 20-user scan.
    // (If the bug were present and sampling were skipped, steps[0].count would be 1.)
    expect(r.steps.length === 0 || r.steps[0]!.count === 0).toBe(true);
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
