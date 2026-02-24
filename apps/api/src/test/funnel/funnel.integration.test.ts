import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import { queryFunnel, queryFunnelTimeToConvert } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryFunnel — non-breakdown', () => {
  it('counts users completing a 3-step funnel', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'onboarding_complete',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'first_purchase',
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signed up' },
        { event_name: 'onboarding_complete', label: 'Onboarded' },
        { event_name: 'first_purchase', label: 'Purchased' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].count).toBe(2);
      expect(result.steps[1].count).toBe(1);
      expect(result.steps[2].count).toBe(1);
      expect(result.steps[0].conversion_rate).toBe(100);
      expect(result.steps[1].conversion_rate).toBe(50);
      expect(result.steps[2].conversion_rate).toBe(50);
    }
  });

  it('respects conversion window — out-of-window events are not counted', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: 'user-slow',
        event_name: 'step_a',
        timestamp: msAgo(3 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: 'user-slow',
        event_name: 'step_b',
        // 2 days after step_a — within 1 day conversion window? NO
        timestamp: msAgo(1 * DAY_MS),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 1,
      date_from: dateOffset(-7),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1); // entered step A
      expect(result.steps[1].count).toBe(0); // step B out of window
    }
  });

  it('returns zero counts when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'never_happened_a', label: 'Step A' },
        { event_name: 'never_happened_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: '2020-01-01',
      date_to: '2020-01-02',
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      for (const step of result.steps) {
        expect(step.count).toBe(0);
      }
    }
  });

  it('applies step filters correctly', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-filter',
        event_name: 'click',
        properties: JSON.stringify({ button: 'signup' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-filter',
        event_name: 'click',
        properties: JSON.stringify({ button: 'other' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user-filter',
        event_name: 'purchase',
        timestamp: msAgo(0),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'click',
          label: 'Signup Click',
          filters: [{ property: 'properties.button', operator: 'eq', value: 'signup' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1);
      expect(result.steps[1].count).toBe(1);
    }
  });
});

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
    if (result.breakdown) {
      expect(result.breakdown_property).toBe('browser');
      const chromeSteps = result.steps.filter((s) => s.breakdown_value === 'Chrome');
      const firefoxSteps = result.steps.filter((s) => s.breakdown_value === 'Firefox');
      expect(chromeSteps.find((s) => s.step === 1)?.count).toBe(2);
      expect(firefoxSteps.find((s) => s.step === 1)?.count).toBe(1);
      expect(result.aggregate_steps).toBeDefined();
      expect(result.aggregate_steps.find((s) => s.step === 1)?.count).toBe(3);
    }
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
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(2); // both entered
      expect(result.steps[1].count).toBe(1); // only personOk completes strict
    }
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
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(3); // all 3 entered
      expect(result.steps[1].count).toBe(3); // all 3 did at least 2 unique steps
      expect(result.steps[2].count).toBe(2); // forward + reverse did all 3
    }
  });
});

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
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1); // only clean user
      expect(result.steps[1].count).toBe(1);
    }
  });
});

// ── P1: Granular conversion window ──────────────────────────────────────────

describe('queryFunnel — conversion window units', () => {
  it('uses minute-based conversion window', async () => {
    const projectId = randomUUID();
    const personFast = randomUUID();
    const personSlow = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // Fast: step_a → step_b within 30 seconds
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_a',
        timestamp: new Date(now - 60_000).toISOString(), // 60 sec ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_b',
        timestamp: new Date(now - 30_000).toISOString(), // 30 sec ago
      }),
      // Slow: step_a → step_b with 3 minutes gap
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_a',
        timestamp: new Date(now - 300_000).toISOString(), // 5 min ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_b',
        timestamp: new Date(now - 120_000).toISOString(), // 2 min ago
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
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(2); // both entered
      expect(result.steps[1].count).toBe(1); // only fast within 1 min
    }
  });
});

// ── P1: Time to convert ─────────────────────────────────────────────────────

describe('queryFunnelTimeToConvert', () => {
  it('returns timing distribution for completed funnel users', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // Person A: 10 seconds to convert
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'signup',
        timestamp: new Date(now - 60_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: new Date(now - 50_000).toISOString(),
      }),
      // Person B: 30 seconds to convert
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'signup',
        timestamp: new Date(now - 90_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: new Date(now - 60_000).toISOString(),
      }),
      // Person C: only signup, no purchase
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'signup',
        timestamp: new Date(now - 60_000).toISOString(),
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      from_step: 0,
      to_step: 1,
    });

    expect(result.from_step).toBe(0);
    expect(result.to_step).toBe(1);
    expect(result.sample_size).toBe(2); // only A and B converted
    expect(result.average_seconds).toBeGreaterThan(0);
    expect(result.median_seconds).toBeGreaterThan(0);
    expect(result.bins.length).toBeGreaterThan(0);

    // Total count in bins should equal sample_size
    const totalBinCount = result.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(2);
  });

  it('returns empty result when no one converts', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'lonely',
        event_name: 'signup',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      from_step: 0,
      to_step: 1,
    });

    expect(result.sample_size).toBe(0);
    expect(result.average_seconds).toBeNull();
    expect(result.median_seconds).toBeNull();
    expect(result.bins).toHaveLength(0);
  });
});

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
    if (!full.breakdown) {
      expect(full.steps[0].count).toBe(20);
      expect(full.steps[1].count).toBe(20);
      expect(full.sampling_factor).toBeUndefined();
    }

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
    if (!sampled.breakdown) {
      expect(sampled.sampling_factor).toBe(0.5);
      // With 20 users and 50% sampling, we expect roughly 10 (±5 due to hash distribution)
      expect(sampled.steps[0].count).toBeGreaterThan(0);
      expect(sampled.steps[0].count).toBeLessThanOrEqual(20);
      // Conversion rate should remain 100% (all sampled users complete both steps)
      expect(sampled.steps[1].conversion_rate).toBe(100);
    }

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

    if (!sampled.breakdown && !sampled2.breakdown) {
      expect(sampled2.steps[0].count).toBe(sampled.steps[0].count);
    }
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

    if (!noSampling.breakdown && !factor1.breakdown) {
      expect(factor1.steps[0].count).toBe(noSampling.steps[0].count);
      expect(factor1.steps[1].count).toBe(noSampling.steps[1].count);
    }
  });
});

// ── P2: Inline Event Combination (OR-logic) ──────────────────────────────────

describe('queryFunnel — inline event combination (OR-logic)', () => {
  it('matches multiple event names within a single step using event_names', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Person A: click_signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'click_signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Person B: submit_signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'submit_signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Person C: only page_view → purchase (neither signup event)
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'page_view',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'click_signup',
          event_names: ['click_signup', 'submit_signup'],
          label: 'Any Signup',
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(2); // A + B (both signup variants)
      expect(result.steps[1].count).toBe(2); // both purchased
    }
  });

  it('falls back to single event_name when event_names is empty', async () => {
    const projectId = randomUUID();
    const pid = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'signup',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    // event_names is empty array — should fall back to event_name
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', event_names: [], label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1);
      expect(result.steps[1].count).toBe(1);
    }
  });

  it('works with event_names in unordered mode', async () => {
    const projectId = randomUUID();
    const pid = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'checkout_start',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'payment_submit',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'checkout_start',
          event_names: ['checkout_start', 'checkout_begin'],
          label: 'Start Checkout',
        },
        {
          event_name: 'payment_submit',
          event_names: ['payment_submit', 'payment_complete'],
          label: 'Payment',
        },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1);
      expect(result.steps[1].count).toBe(1);
    }
  });
});
