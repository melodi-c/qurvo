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
import type { CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── cohort breakdown avg_time_to_convert ─────────────────────────────────────

describe('queryFunnel — cohort breakdown avg_time_to_convert (ordered)', () => {
  it('returns non-null avg_time_to_convert_seconds for cohorts with converters (ordered)', async () => {
    const projectId = randomUUID();
    const premiumUser1 = randomUUID();
    const premiumUser2 = randomUUID();
    const freeUser = randomUUID();

    // premiumUser1: signup → checkout in 20s
    // premiumUser2: signup → checkout in 40s  → premium cohort avg = 30s
    // freeUser: signup → checkout in 60s      → free cohort avg = 60s
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser1,
        distinct_id: 'p1',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(60_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser1,
        distinct_id: 'p1',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(40_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser2,
        distinct_id: 'p2',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(80_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser2,
        distinct_id: 'p2',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(40_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'f1',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(90_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'f1',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(30_000),
      }),
    ]);

    const premiumCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Premium',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    };
    const freeCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Free',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_cohort_ids: [premiumCohort, freeCohort],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    // Per-cohort step results
    const premiumStep1 = rBd.steps.find((s) => s.breakdown_value === 'Premium' && s.step === 1);
    const premiumStep2 = rBd.steps.find((s) => s.breakdown_value === 'Premium' && s.step === 2);
    const freeStep1 = rBd.steps.find((s) => s.breakdown_value === 'Free' && s.step === 1);
    const freeStep2 = rBd.steps.find((s) => s.breakdown_value === 'Free' && s.step === 2);

    expect(premiumStep1?.count).toBe(2);
    expect(premiumStep2?.count).toBe(2);
    expect(freeStep1?.count).toBe(1);
    expect(freeStep2?.count).toBe(1);

    // avg_time_to_convert_seconds must NOT be null for step 1 (non-last step with converters)
    expect(premiumStep1?.avg_time_to_convert_seconds).not.toBeNull();
    expect(premiumStep1?.avg_time_to_convert_seconds).toBeGreaterThan(0);
    // premiumUser1: 20s, premiumUser2: 40s → avg ≈ 30s
    expect(premiumStep1?.avg_time_to_convert_seconds).toBeCloseTo(30, 0);

    expect(freeStep1?.avg_time_to_convert_seconds).not.toBeNull();
    expect(freeStep1?.avg_time_to_convert_seconds).toBeGreaterThan(0);
    // freeUser: 60s → avg = 60s
    expect(freeStep1?.avg_time_to_convert_seconds).toBeCloseTo(60, 0);

    // Last step always null
    expect(premiumStep2?.avg_time_to_convert_seconds).toBeNull();
    expect(freeStep2?.avg_time_to_convert_seconds).toBeNull();

    // aggregate_steps should also have non-null avg_time for step 1
    const aggStep1 = rBd.aggregate_steps.find((s) => s.step === 1);
    const aggStep2 = rBd.aggregate_steps.find((s) => s.step === 2);
    expect(aggStep1?.avg_time_to_convert_seconds).not.toBeNull();
    expect(aggStep1?.avg_time_to_convert_seconds).toBeGreaterThan(0);
    expect(aggStep2?.avg_time_to_convert_seconds).toBeNull();
  });

  it('returns null avg_time_to_convert_seconds for a cohort with no converters (ordered)', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // premiumUser: signup only (no checkout) — does not convert
    // freeUser: signup → checkout
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'p1',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(30_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'f1',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(30_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'f1',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(10_000),
      }),
    ]);

    const premiumCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Premium',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    };
    const freeCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Free',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      breakdown_cohort_ids: [premiumCohort, freeCohort],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const premiumStep1 = rBd.steps.find((s) => s.breakdown_value === 'Premium' && s.step === 1);
    const freeStep1 = rBd.steps.find((s) => s.breakdown_value === 'Free' && s.step === 1);

    // Premium: 1 user entered but 0 converted → avg_time must be null
    expect(premiumStep1?.count).toBe(1);
    expect(premiumStep1?.avg_time_to_convert_seconds).toBeNull();

    // Free: 1 user entered and 1 converted → avg_time must be non-null
    expect(freeStep1?.count).toBe(1);
    expect(freeStep1?.avg_time_to_convert_seconds).not.toBeNull();
    expect(freeStep1?.avg_time_to_convert_seconds).toBeCloseTo(20, 0);
  });
});

describe('queryFunnel — cohort breakdown avg_time_to_convert (unordered)', () => {
  it('returns non-null avg_time_to_convert_seconds for cohorts with converters (unordered)', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // premiumUser: step_b first then step_a — 30s apart (unordered)
    // freeUser: step_a first then step_b — 10s apart (unordered)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'p1',
        event_name: 'step_b',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(50_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'p1',
        event_name: 'step_a',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(20_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'f1',
        event_name: 'step_a',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(40_000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'f1',
        event_name: 'step_b',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(30_000),
      }),
    ]);

    const premiumCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Premium',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    };
    const freeCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Free',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'unordered',
      breakdown_cohort_ids: [premiumCohort, freeCohort],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const premiumStep1 = rBd.steps.find((s) => s.breakdown_value === 'Premium' && s.step === 1);
    const freeStep1 = rBd.steps.find((s) => s.breakdown_value === 'Free' && s.step === 1);

    // Both cohorts convert — avg_time must be non-null and positive
    expect(premiumStep1?.avg_time_to_convert_seconds).not.toBeNull();
    expect(premiumStep1?.avg_time_to_convert_seconds).toBeGreaterThan(0);
    // premiumUser: anchor=t_b(50s ago), latest=t_a(20s ago) → 30s
    expect(premiumStep1?.avg_time_to_convert_seconds).toBeCloseTo(30, 0);

    expect(freeStep1?.avg_time_to_convert_seconds).not.toBeNull();
    expect(freeStep1?.avg_time_to_convert_seconds).toBeGreaterThan(0);
    // freeUser: anchor=t_a(40s ago), latest=t_b(30s ago) → 10s
    expect(freeStep1?.avg_time_to_convert_seconds).toBeCloseTo(10, 0);
  });
});
