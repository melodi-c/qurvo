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
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[2].count).toBe(1);
    expect(r.steps[0].conversion_rate).toBe(100);
    expect(r.steps[1].conversion_rate).toBe(50);
    expect(r.steps[2].conversion_rate).toBe(50);
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
    const r2 = result as Extract<typeof result, { breakdown: false }>;
    expect(r2.steps[0].count).toBe(1); // entered step A
    expect(r2.steps[1].count).toBe(0); // step B out of window
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
      date_from: dateOffset(-5),
      date_to: dateOffset(-3),
    });

    expect(result.breakdown).toBe(false);
    const r3 = result as Extract<typeof result, { breakdown: false }>;
    for (const step of r3.steps) {
      expect(step.count).toBe(0);
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
    const r4 = result as Extract<typeof result, { breakdown: false }>;
    expect(r4.steps[0].count).toBe(1);
    expect(r4.steps[1].count).toBe(1);
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

// ── P1: Time to convert ─────────────────────────────────────────────────────

describe('queryFunnelTimeToConvert', () => {
  it('returns timing distribution for completed funnel users', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Person A: 10 seconds to convert
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'signup',
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(50_000),
      }),
      // Person B: 30 seconds to convert
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'signup',
        timestamp: msAgo(90_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(60_000),
      }),
      // Person C: only signup, no purchase
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'signup',
        timestamp: msAgo(60_000),
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
    const rOr = result as Extract<typeof result, { breakdown: false }>;
    expect(rOr.steps[0].count).toBe(2); // A + B (both signup variants)
    expect(rOr.steps[1].count).toBe(2); // both purchased
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
    const rFb = result as Extract<typeof result, { breakdown: false }>;
    expect(rFb.steps[0].count).toBe(1);
    expect(rFb.steps[1].count).toBe(1);
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
    const rUn = result as Extract<typeof result, { breakdown: false }>;
    expect(rUn.steps[0].count).toBe(1);
    expect(rUn.steps[1].count).toBe(1);
  });
});
