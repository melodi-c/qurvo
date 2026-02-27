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
      conversion_window_value: 60,
      conversion_window_unit: 'second',
      conversion_window_days: 7,
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
