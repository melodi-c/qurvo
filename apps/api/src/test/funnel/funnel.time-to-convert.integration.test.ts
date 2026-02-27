import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel, queryFunnelTimeToConvert } from '../../analytics/funnel/funnel.query';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

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
    // Person A: 10s, Person B: 30s → avg = 20s, median = 20s
    expect(result.average_seconds).toBeCloseTo(20, 0);
    expect(result.median_seconds).toBeCloseTo(20, 0);
    expect(result.bins.length).toBeGreaterThan(0);

    // Total count in bins should equal sample_size
    const totalBinCount = result.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(2);
  });

  it('excludes conversions beyond the conversion window from avg and median', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // Conversion window: 60 seconds
    // Person A: converts in 10s (within window) → included
    // Person B: converts in 30s (within window) → included
    // Person C: converts in 120s (beyond 60s window) → excluded from avg/median/sample_size
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a-outlier',
        event_name: 'page_view',
        timestamp: msAgo(100_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a-outlier',
        event_name: 'checkout',
        timestamp: msAgo(90_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b-outlier',
        event_name: 'page_view',
        timestamp: msAgo(100_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b-outlier',
        event_name: 'checkout',
        timestamp: msAgo(70_000),
      }),
      // Person C: 120s to convert — beyond the 60s window
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c-outlier',
        event_name: 'page_view',
        timestamp: msAgo(200_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c-outlier',
        event_name: 'checkout',
        timestamp: msAgo(80_000),
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'page_view', label: 'Page View' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      // Use explicit value/unit to specify a 60-second window.
      // conversion_window_days must be the default (14) when value/unit are provided.
      conversion_window_days: 14,
      conversion_window_value: 60,
      conversion_window_unit: 'second',
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      from_step: 0,
      to_step: 1,
    });

    // Only persons A (10s) and B (30s) should be included; person C (120s) is beyond window
    expect(result.sample_size).toBe(2);
    // avg of [10, 30] = 20; must not be ~53 (avg of [10, 30, 120])
    expect(result.average_seconds).toBeGreaterThan(0);
    expect(result.average_seconds).toBeLessThanOrEqual(60);
    // median of [10, 30] = 20; must not be ~30 (median of [10, 30, 120])
    expect(result.median_seconds).toBeGreaterThan(0);
    expect(result.median_seconds).toBeLessThanOrEqual(60);
    // bins should only contain 2 conversions total
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

  it('throws AppBadRequestException when from_step >= to_step', async () => {
    const projectId = randomUUID();

    await expect(
      queryFunnelTimeToConvert(ctx.ch, {
        project_id: projectId,
        steps: [
          { event_name: 'signup', label: 'Signup' },
          { event_name: 'purchase', label: 'Purchase' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        from_step: 1,
        to_step: 1,
      }),
    ).rejects.toThrow(AppBadRequestException);

    await expect(
      queryFunnelTimeToConvert(ctx.ch, {
        project_id: projectId,
        steps: [
          { event_name: 'signup', label: 'Signup' },
          { event_name: 'purchase', label: 'Purchase' },
          { event_name: 'upsell', label: 'Upsell' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        from_step: 2,
        to_step: 0,
      }),
    ).rejects.toThrow(AppBadRequestException);
  });
});

// ── TTC from_step > 0 ────────────────────────────────────────────────────────

describe('queryFunnelTimeToConvert — from_step > 0 sequence-aware timestamps', () => {
  it('TTC from_step=1 to_step=2 ignores checkout events that occurred before step 0', async () => {
    // Scenario from the bug report:
    //   3-step funnel: signup (0) → checkout (1) → purchase (2)
    //   from_step=1, to_step=2
    //
    // User timeline:
    //   checkout@T0 (120 s ago)  — before signup; old minIf would pick this as step_1_ms
    //   signup@T1   (100 s ago)  — step 0
    //   checkout@T2  (60 s ago)  — step 1 (the one windowFunnel actually uses)
    //   purchase@T3  (20 s ago)  — step 2
    //
    // Correct TTC (checkout→purchase): T3 − T2 = 40 s
    // Buggy  TTC (earliest checkout→purchase): T3 − T0 = 100 s
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    const T0 = new Date(now - 120_000).toISOString(); // checkout before signup
    const T1 = new Date(now - 100_000).toISOString(); // signup (step 0)
    const T2 = new Date(now - 60_000).toISOString();  // checkout after signup (step 1)
    const T3 = new Date(now - 20_000).toISOString();  // purchase (step 2)

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'seq-user',
        event_name: 'checkout',
        timestamp: T0,
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'seq-user',
        event_name: 'signup',
        timestamp: T1,
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'seq-user',
        event_name: 'checkout',
        timestamp: T2,
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'seq-user',
        event_name: 'purchase',
        timestamp: T3,
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      from_step: 1,
      to_step: 2,
    });

    expect(result.sample_size).toBe(1);
    // Correct TTC: T3 − T2 = 40 s ± rounding; must NOT be ~100 s (buggy behaviour)
    expect(result.average_seconds).not.toBeNull();
    expect(result.average_seconds!).toBeGreaterThan(30);
    expect(result.average_seconds!).toBeLessThan(60);

    // Bins must contain exactly 1 conversion
    const totalBinCount = result.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(1);
  });

  it('sample_size in TTC matches steps[to_step].count in main funnel query', async () => {
    // Verifies the second acceptance criterion: sample_size === funnel step count.
    // 3-step funnel with 3 users:
    //   personA: signup → checkout → purchase  (full conversion, checkout repeated before signup)
    //   personB: signup → checkout → purchase  (full conversion, clean)
    //   personC: signup → checkout only        (drops off at step 1, no purchase)
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // personA: checkout before signup (old event), then normal sequence
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'ttc-a',
        event_name: 'checkout', timestamp: new Date(now - 200_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'ttc-a',
        event_name: 'signup', timestamp: new Date(now - 150_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'ttc-a',
        event_name: 'checkout', timestamp: new Date(now - 100_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'ttc-a',
        event_name: 'purchase', timestamp: new Date(now - 50_000).toISOString(),
      }),
      // personB: clean 3-step sequence
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'ttc-b',
        event_name: 'signup', timestamp: new Date(now - 120_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'ttc-b',
        event_name: 'checkout', timestamp: new Date(now - 80_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'ttc-b',
        event_name: 'purchase', timestamp: new Date(now - 30_000).toISOString(),
      }),
      // personC: signup + checkout only, no purchase
      buildEvent({
        project_id: projectId, person_id: personC, distinct_id: 'ttc-c',
        event_name: 'signup', timestamp: new Date(now - 90_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId, person_id: personC, distinct_id: 'ttc-c',
        event_name: 'checkout', timestamp: new Date(now - 60_000).toISOString(),
      }),
    ]);

    const sharedParams = {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    };

    const funnelResult = await queryFunnel(ctx.ch, sharedParams);
    expect(funnelResult.breakdown).toBe(false);
    const funnelSteps = (funnelResult as Extract<typeof funnelResult, { breakdown: false }>).steps;
    // All 3 users enter step 0
    expect(funnelSteps[0].count).toBe(3);
    // Only personA and personB complete step 2 (purchase)
    expect(funnelSteps[2].count).toBe(2);
    const expectedSampleSize = funnelSteps[2].count;

    const ttcResult = await queryFunnelTimeToConvert(ctx.ch, {
      ...sharedParams,
      from_step: 1,
      to_step: 2,
    });

    // sample_size must match main funnel steps[to_step].count
    expect(ttcResult.sample_size).toBe(expectedSampleSize);
    expect(ttcResult.sample_size).toBe(2);
  });
});

// ── P1: TTC exclusions ───────────────────────────────────────────────────────

describe('queryFunnelTimeToConvert — exclusions', () => {
  it('sample_size in TTC matches converted count (step 1 entered) in main funnel with exclusion', async () => {
    // Scenario: 3 users enter the funnel.
    // personClean: signup → purchase (clean, converts)
    // personExcluded: signup → cancel → purchase (excluded from entire funnel by exclusion rule)
    // personNoConvert: signup only (enters step 0 but does not reach step 1)
    //
    // With exclusion applied:
    //   - main funnel step 0 count = 2 (personClean + personNoConvert; personExcluded is removed)
    //   - main funnel step 1 count = 1 (only personClean converts)
    //   - TTC sample_size must equal main funnel step 1 count = 1 (only personClean)
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();
    const personNoConvert = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personClean: signup → purchase (no cancel between) → converts
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'purchase',
        timestamp: msAgo(3000),
      }),
      // personExcluded: signup → cancel → purchase → excluded from funnel entirely
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'signup',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'cancel',
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'purchase',
        timestamp: msAgo(3000),
      }),
      // personNoConvert: signup only, no purchase
      buildEvent({
        project_id: projectId,
        person_id: personNoConvert,
        distinct_id: 'no-convert',
        event_name: 'signup',
        timestamp: msAgo(5000),
      }),
    ]);

    const exclusions = [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }];
    const steps = [
      { event_name: 'signup', label: 'Signup' },
      { event_name: 'purchase', label: 'Purchase' },
    ];
    const dateParams = {
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    };

    // Main funnel with exclusion
    const funnelResult = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps,
      ...dateParams,
      exclusions,
    });

    expect(funnelResult.breakdown).toBe(false);
    const funnelSteps = (funnelResult as Extract<typeof funnelResult, { breakdown: false }>).steps;
    // personExcluded is removed by exclusion; personClean and personNoConvert enter step 0
    expect(funnelSteps[0].count).toBe(2);
    // Only personClean completes the funnel (step 1)
    expect(funnelSteps[1].count).toBe(1);

    const convertedCount = funnelSteps[1].count; // 1

    // TTC with same exclusion — sample_size must match convertedCount
    const ttcResult = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps,
      ...dateParams,
      from_step: 0,
      to_step: 1,
      exclusions,
    });

    expect(ttcResult.sample_size).toBe(convertedCount);
    expect(ttcResult.sample_size).toBe(1);

    // Bins total should match sample_size
    const totalBinCount = ttcResult.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(ttcResult.sample_size);
  });

  it('sample_size is 2 without exclusion (includes excluded user) and 1 with exclusion', async () => {
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personClean: signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean2',
        event_name: 'signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean2',
        event_name: 'purchase',
        timestamp: msAgo(4000),
      }),
      // personExcluded: signup → cancel → purchase
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded2',
        event_name: 'signup',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded2',
        event_name: 'cancel',
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded2',
        event_name: 'purchase',
        timestamp: msAgo(4000),
      }),
    ]);

    const baseParams = {
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
    };

    // Without exclusion: both persons convert → sample_size = 2
    const ttcWithout = await queryFunnelTimeToConvert(ctx.ch, baseParams);
    expect(ttcWithout.sample_size).toBe(2);

    // With exclusion: only personClean converts → sample_size = 1
    const ttcWith = await queryFunnelTimeToConvert(ctx.ch, {
      ...baseParams,
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });
    expect(ttcWith.sample_size).toBe(1);
  });
});

// ── funnel_order_type consistency ────────────────────────────────────────────

describe('queryFunnelTimeToConvert — funnel_order_type consistency', () => {
  it('strict mode: sample_size TTC matches steps[to_step].count in main funnel', async () => {
    // Scenario: a 2-step funnel in strict mode.
    // personClean: signup → purchase (no intervening events) — converts in strict mode.
    // personInterrupted: signup → pageview → purchase (pageview resets strict_order) — does NOT convert.
    //
    // Main funnel strict: steps[1].count = 1 (only personClean)
    // TTC strict: sample_size must equal 1 (matches main funnel)
    // TTC ordered (wrong): would return sample_size = 2 (both users counted)
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personInterrupted = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personClean: signup → purchase (clean)
      buildEvent({
        project_id: projectId, person_id: personClean, distinct_id: 'strict-clean',
        event_name: 'signup', timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId, person_id: personClean, distinct_id: 'strict-clean',
        event_name: 'purchase', timestamp: msAgo(3000),
      }),
      // personInterrupted: signup → pageview → purchase (pageview breaks strict_order)
      buildEvent({
        project_id: projectId, person_id: personInterrupted, distinct_id: 'strict-interrupted',
        event_name: 'signup', timestamp: msAgo(9000),
      }),
      buildEvent({
        project_id: projectId, person_id: personInterrupted, distinct_id: 'strict-interrupted',
        event_name: 'pageview', timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId, person_id: personInterrupted, distinct_id: 'strict-interrupted',
        event_name: 'purchase', timestamp: msAgo(3000),
      }),
    ]);

    const sharedParams = {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict' as const,
    };

    const funnelResult = await queryFunnel(ctx.ch, sharedParams);
    expect(funnelResult.breakdown).toBe(false);
    const funnelSteps = (funnelResult as Extract<typeof funnelResult, { breakdown: false }>).steps;
    // Only personClean converts in strict mode
    expect(funnelSteps[1]!.count).toBe(1);

    const ttcResult = await queryFunnelTimeToConvert(ctx.ch, {
      ...sharedParams,
      from_step: 0,
      to_step: 1,
    });

    // sample_size must match main funnel steps[1].count
    expect(ttcResult.sample_size).toBe(funnelSteps[1]!.count);
    expect(ttcResult.sample_size).toBe(1);

    // Bins total should match sample_size
    const totalBinCount = ttcResult.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(ttcResult.sample_size);
  });

  it('unordered mode: TTC only counts users where fromStep occurred before toStep', async () => {
    // Scenario: a 2-step funnel in unordered mode.
    // personA: purchase → signup (steps in reverse order) — converts in unordered mode.
    //   But for TTC (from_step=0/signup, to_step=1/purchase), purchase happened BEFORE signup,
    //   so this is a reverse conversion and must NOT be counted in TTC.
    // personB: signup → purchase (in-order) — converts in unordered mode and in TTC.
    // personC: signup only — does NOT complete step 2.
    //
    // Main funnel unordered: steps[1].count = 2 (personA and personB)
    // TTC unordered: sample_size = 1 (only personB — fromStep before toStep)
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: reverse order — purchase first, then signup.
      // to_step (purchase) is BEFORE from_step (signup) → excluded from TTC.
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'unordered-a',
        event_name: 'purchase', timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'unordered-a',
        event_name: 'signup', timestamp: msAgo(4000),
      }),
      // personB: in-order signup → purchase. from_step (signup) before to_step (purchase) → included.
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'unordered-b',
        event_name: 'signup', timestamp: msAgo(7000),
      }),
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'unordered-b',
        event_name: 'purchase', timestamp: msAgo(3000),
      }),
      // personC: signup only
      buildEvent({
        project_id: projectId, person_id: personC, distinct_id: 'unordered-c',
        event_name: 'signup', timestamp: msAgo(5000),
      }),
    ]);

    const sharedParams = {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'unordered' as const,
    };

    const funnelResult = await queryFunnel(ctx.ch, sharedParams);
    expect(funnelResult.breakdown).toBe(false);
    const funnelSteps = (funnelResult as Extract<typeof funnelResult, { breakdown: false }>).steps;
    // personA and personB both complete 2 steps (in any order) in the main funnel
    expect(funnelSteps[1]!.count).toBe(2);

    const ttcResult = await queryFunnelTimeToConvert(ctx.ch, {
      ...sharedParams,
      from_step: 0,
      to_step: 1,
    });

    // TTC only counts personB (signup before purchase).
    // personA is excluded because their purchase (toStep) occurred before signup (fromStep).
    expect(ttcResult.sample_size).toBe(1);

    // personB duration: signup at msAgo(7000), purchase at msAgo(3000) → ~4s
    expect(ttcResult.average_seconds).not.toBeNull();
    expect(ttcResult.average_seconds).toBeGreaterThan(0);

    // Bins total should match sample_size
    const totalBinCount = ttcResult.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(ttcResult.sample_size);
  });

  it('unordered mode: user with toStep before fromStep is excluded; user with fromStep before toStep is included with correct duration', async () => {
    // Direct regression test for: abs() replaced with directional check.
    // personReverse: toStep (purchase) at t=-20s, fromStep (signup) at t=-10s.
    //   abs(to - from) = 10s — was wrongly included with duration_seconds = 10.
    //   With fix: to_step_ms < from_step_ms → excluded.
    // personForward: fromStep (signup) at t=-20s, toStep (purchase) at t=-10s.
    //   duration = 10s → included, duration_seconds = 10.
    const projectId = randomUUID();
    const personReverse = randomUUID();
    const personForward = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personReverse: purchase (toStep) then signup (fromStep) — reverse order
      buildEvent({
        project_id: projectId, person_id: personReverse, distinct_id: 'rev-user',
        event_name: 'purchase', timestamp: msAgo(20_000),
      }),
      buildEvent({
        project_id: projectId, person_id: personReverse, distinct_id: 'rev-user',
        event_name: 'signup', timestamp: msAgo(10_000),
      }),
      // personForward: signup (fromStep) then purchase (toStep) — forward order, 10s apart
      buildEvent({
        project_id: projectId, person_id: personForward, distinct_id: 'fwd-user',
        event_name: 'signup', timestamp: msAgo(20_000),
      }),
      buildEvent({
        project_id: projectId, person_id: personForward, distinct_id: 'fwd-user',
        event_name: 'purchase', timestamp: msAgo(10_000),
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
      funnel_order_type: 'unordered' as const,
    });

    // Only personForward should be included (fromStep before toStep)
    expect(result.sample_size).toBe(1);
    // personForward duration ≈ 10s
    expect(result.average_seconds).not.toBeNull();
    expect(result.average_seconds).toBeGreaterThan(0);
    // Bins total should match sample_size
    const totalBinCount = result.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(1);
  });

  it('default (no funnel_order_type) uses ordered mode — reverse-order user is NOT counted', async () => {
    // Verifies that the default behaviour (ordered) is unchanged.
    // personA: purchase → signup (reverse order) — does NOT convert in ordered mode.
    // personB: signup → purchase (in-order) — converts.
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'default-a',
        event_name: 'purchase', timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId, person_id: personA, distinct_id: 'default-a',
        event_name: 'signup', timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'default-b',
        event_name: 'signup', timestamp: msAgo(7000),
      }),
      buildEvent({
        project_id: projectId, person_id: personB, distinct_id: 'default-b',
        event_name: 'purchase', timestamp: msAgo(3000),
      }),
    ]);

    const ttcResult = await queryFunnelTimeToConvert(ctx.ch, {
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
      // no funnel_order_type → defaults to ordered
    });

    // Only personB converts (in-order); personA reverse-order is NOT counted in ordered mode
    expect(ttcResult.sample_size).toBe(1);
  });
});

// ── P1: 8-10 step SQL size regression ────────────────────────────────────────
// Verifies that large funnels do not trigger ClickHouse's max_query_size limit.
// Before the fix the SQL grew at O(2^n) — at 8 steps it exceeded 256 KB.
// After the fix (per-step CTE chain) it grows at O(n).

describe('queryFunnelTimeToConvert — 8/9/10-step funnel SQL size', () => {
  const makeSteps = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ event_name: `step_${i}`, label: `Step ${i}` }));

  it('10-step ordered funnel TTC executes without max_query_size error', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // Insert a user who completes all 10 steps in order
    const now = Date.now();
    await insertTestEvents(ctx.ch, Array.from({ length: 10 }, (_, i) =>
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'ten-step-user',
        event_name: `step_${i}`,
        timestamp: new Date(now - (10 - i) * 1000).toISOString(),
      }),
    ));

    // This call must not throw — previously it crashed with "Max query size exceeded"
    await expect(
      queryFunnelTimeToConvert(ctx.ch, {
        project_id: projectId,
        steps: makeSteps(10),
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        from_step: 0,
        to_step: 9,
      }),
    ).resolves.not.toThrow();
  });

  it('10-step ordered funnel TTC returns correct sample_size for single converting user', async () => {
    const projectId = randomUUID();
    const person = randomUUID();
    const noConvertPerson = randomUUID();

    const now = Date.now();
    // Full converter: completes all 10 steps
    await insertTestEvents(ctx.ch, Array.from({ length: 10 }, (_, i) =>
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'ten-full',
        event_name: `step_${i}`,
        timestamp: new Date(now - (10 - i) * 2000).toISOString(),
      }),
    ));
    // Partial converter: only first 5 steps
    await insertTestEvents(ctx.ch, Array.from({ length: 5 }, (_, i) =>
      buildEvent({
        project_id: projectId,
        person_id: noConvertPerson,
        distinct_id: 'ten-partial',
        event_name: `step_${i}`,
        timestamp: new Date(now - (10 - i) * 2000).toISOString(),
      }),
    ));

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps: makeSteps(10),
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      from_step: 0,
      to_step: 9,
    });

    // Only the full converter qualifies
    expect(result.sample_size).toBe(1);
    expect(result.average_seconds).not.toBeNull();
    expect(result.average_seconds).toBeGreaterThan(0);
    // 10 steps * 2s gap = 18s total (step_0 to step_9)
    expect(result.average_seconds!).toBeGreaterThan(15);
    expect(result.average_seconds!).toBeLessThan(25);
    const totalBinCount = result.bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalBinCount).toBe(1);
  });

  it('8-step ordered funnel TTC matches correct sequence-aware timestamps', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    const now = Date.now();
    // User completes all 8 steps, each 3 seconds apart
    await insertTestEvents(ctx.ch, Array.from({ length: 8 }, (_, i) =>
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'eight-step-user',
        event_name: `step_${i}`,
        timestamp: new Date(now - (8 - i) * 3000).toISOString(),
      }),
    ));

    const result = await queryFunnelTimeToConvert(ctx.ch, {
      project_id: projectId,
      steps: makeSteps(8),
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      from_step: 0,
      to_step: 7,
    });

    expect(result.sample_size).toBe(1);
    // 8 steps * 3s gap = 21s total
    expect(result.average_seconds).not.toBeNull();
    expect(result.average_seconds!).toBeGreaterThan(18);
    expect(result.average_seconds!).toBeLessThan(25);
  });
});
