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

describe('queryFunnel — breakdown_limit', () => {
  it('limits property breakdown to top-N groups by entered count', async () => {
    const projectId = randomUUID();

    // Insert 30 distinct browser values — each with 1 user entering the funnel.
    // Users for browsers 1–10 also complete step 2 (higher conversion = more prominent).
    const browsers = Array.from({ length: 30 }, (_, i) => `Browser${i + 1}`);

    const events = browsers.flatMap((browser, idx) => {
      const personId = randomUUID();
      const distinctId = `user-${browser}`;
      const evts = [
        buildEvent({
          project_id: projectId,
          person_id: personId,
          distinct_id: distinctId,
          event_name: 'signup',
          browser,
          timestamp: msAgo(10000 + idx * 100),
        }),
      ];
      // First 10 browsers also complete checkout
      if (idx < 10) {
        evts.push(
          buildEvent({
            project_id: projectId,
            person_id: personId,
            distinct_id: distinctId,
            event_name: 'checkout',
            browser,
            timestamp: msAgo(9000 + idx * 100),
          }),
        );
      }
      return evts;
    });

    await insertTestEvents(ctx.ch, events);

    // Query with default limit (should not exceed MAX_BREAKDOWN_VALUES = 25)
    const resultDefault = await queryFunnel(ctx.ch, {
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

    expect(resultDefault.breakdown).toBe(true);
    const rDefault = resultDefault as Extract<typeof resultDefault, { breakdown: true }>;
    const uniqueValuesDefault = new Set(rDefault.steps.map((s) => s.breakdown_value)).size;
    // Default limit is 25, we have 30 browsers — should be capped at 25
    expect(uniqueValuesDefault).toBe(25);
    expect(rDefault.breakdown_truncated).toBe(true);

    // Query with explicit limit of 5
    const resultLimited = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
      breakdown_limit: 5,
    });

    expect(resultLimited.breakdown).toBe(true);
    const rLimited = resultLimited as Extract<typeof resultLimited, { breakdown: true }>;
    const uniqueValuesLimited = new Set(rLimited.steps.map((s) => s.breakdown_value)).size;
    expect(uniqueValuesLimited).toBe(5);
    expect(rLimited.breakdown_truncated).toBe(true);
    // All returned groups should have step 1 count >= 1
    const step1Rows = rLimited.steps.filter((s) => s.step === 1);
    for (const row of step1Rows) {
      expect(row.count).toBeGreaterThanOrEqual(1);
    }
    // aggregate_steps should be defined
    expect(rLimited.aggregate_steps).toBeDefined();
    expect(rLimited.aggregate_steps!.length).toBe(2);
  });

  it('does not set breakdown_truncated when result count is below limit', async () => {
    const projectId = randomUUID();

    // Only 3 distinct browser values — well below default limit of 25
    const browsers = ['Safari', 'Chrome', 'Firefox'];
    const events = browsers.map((browser) =>
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: `user-${browser}`,
        event_name: 'pageview',
        browser,
        timestamp: msAgo(5000),
      }),
    );

    await insertTestEvents(ctx.ch, events);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'pageview', label: 'Page View' },
        { event_name: 'signup', label: 'Signup' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    const uniqueValues = new Set(rBd.steps.map((s) => s.breakdown_value)).size;
    expect(uniqueValues).toBe(3);
    // 3 < 25, so breakdown_truncated should be false
    expect(rBd.breakdown_truncated).toBe(false);
  });

  it('does not set breakdown_truncated when result count equals limit (off-by-one fix)', async () => {
    const projectId = randomUUID();

    // Exactly 5 distinct browser values with breakdown_limit: 5 — not truncated.
    const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera'];
    const events = browsers.map((browser) =>
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: `user-${browser}`,
        event_name: 'pageview',
        browser,
        timestamp: msAgo(5000),
      }),
    );

    await insertTestEvents(ctx.ch, events);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'pageview', label: 'Page View' },
        { event_name: 'signup', label: 'Signup' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
      breakdown_limit: 5,
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    const uniqueValues = new Set(rBd.steps.map((s) => s.breakdown_value)).size;
    // Exactly 5 real groups == limit 5 — not truncated (no values were cut off).
    expect(uniqueValues).toBe(5);
    expect(rBd.breakdown_truncated).toBe(false);
  });

  it('sets breakdown_truncated when result count exceeds limit', async () => {
    const projectId = randomUUID();

    // 6 distinct browser values with breakdown_limit: 5 — one must be truncated.
    const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera', 'Brave'];
    const events = browsers.map((browser) =>
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: `user-${browser}`,
        event_name: 'pageview',
        browser,
        timestamp: msAgo(5000),
      }),
    );

    await insertTestEvents(ctx.ch, events);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'pageview', label: 'Page View' },
        { event_name: 'signup', label: 'Signup' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'browser',
      breakdown_limit: 5,
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    const uniqueValues = new Set(rBd.steps.map((s) => s.breakdown_value)).size;
    // 6 real groups > limit 5 — one was cut off, so truncated.
    expect(uniqueValues).toBe(5);
    expect(rBd.breakdown_truncated).toBe(true);
  });

  it('respects breakdown_limit with unordered funnel', async () => {
    const projectId = randomUUID();

    // 10 distinct plans, each with 1 user
    const plans = Array.from({ length: 10 }, (_, i) => `plan_${i + 1}`);
    const events = plans.flatMap((plan) => {
      const personId = randomUUID();
      const distinctId = `user-${plan}`;
      return [
        buildEvent({
          project_id: projectId,
          person_id: personId,
          distinct_id: distinctId,
          event_name: 'step_a',
          properties: JSON.stringify({ plan }),
          timestamp: msAgo(3000),
        }),
        buildEvent({
          project_id: projectId,
          person_id: personId,
          distinct_id: distinctId,
          event_name: 'step_b',
          properties: JSON.stringify({ plan }),
          timestamp: msAgo(2000),
        }),
      ];
    });

    await insertTestEvents(ctx.ch, events);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_property: 'properties.plan',
      breakdown_limit: 5,
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;
    const uniqueValues = new Set(rBd.steps.map((s) => s.breakdown_value)).size;
    expect(uniqueValues).toBe(5);
    expect(rBd.breakdown_truncated).toBe(true);
  });
});
