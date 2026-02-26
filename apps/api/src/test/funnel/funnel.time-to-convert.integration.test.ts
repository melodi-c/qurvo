import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnelTimeToConvert } from '../../analytics/funnel/funnel.query';

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
    expect(result.average_seconds).toBeGreaterThan(0);
    expect(result.median_seconds).toBeGreaterThan(0);
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
});
