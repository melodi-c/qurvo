import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { dateOffset } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import type { CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── Zero events — non-breakdown funnel ───────────────────────────────────────

describe('queryFunnel — zero events: non-breakdown', () => {
  it('2-step funnel with 0 events returns 2 zero-count steps with correct labels and event names', async () => {
    const projectId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Sign Up' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-10),
      date_to: dateOffset(-8),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // Must return N steps, not an empty array
    expect(r.steps).toHaveLength(2);

    // All counts must be zero
    for (const step of r.steps) {
      expect(step.count).toBe(0);
      expect(step.conversion_rate).toBe(0);
      expect(step.drop_off).toBe(0);
      expect(step.drop_off_rate).toBe(0);
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }

    // Labels and event names must be populated from the step config
    expect(r.steps[0].step).toBe(1);
    expect(r.steps[0].label).toBe('Sign Up');
    expect(r.steps[0].event_name).toBe('signup');

    expect(r.steps[1].step).toBe(2);
    expect(r.steps[1].label).toBe('Purchase');
    expect(r.steps[1].event_name).toBe('purchase');
  });

  it('3-step funnel with 0 events returns exactly 3 zero-count steps', async () => {
    const projectId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'view', label: 'View' },
        { event_name: 'add_to_cart', label: 'Add to Cart' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 14,
      date_from: dateOffset(-10),
      date_to: dateOffset(-8),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps).toHaveLength(3);

    for (const step of r.steps) {
      expect(step.count).toBe(0);
      expect(step.conversion_rate).toBe(0);
    }
  });

  it('unordered funnel with 0 events returns N zero-count steps', async () => {
    const projectId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'event_a', label: 'Event A' },
        { event_name: 'event_b', label: 'Event B' },
      ],
      funnel_order_type: 'unordered',
      conversion_window_days: 7,
      date_from: dateOffset(-10),
      date_to: dateOffset(-8),
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    expect(r.steps).toHaveLength(2);

    for (const step of r.steps) {
      expect(step.count).toBe(0);
      expect(step.conversion_rate).toBe(0);
      expect(step.drop_off).toBe(0);
      expect(step.drop_off_rate).toBe(0);
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }
  });
});

// ── Zero events — property breakdown funnel ──────────────────────────────────

describe('queryFunnel — zero events: property breakdown', () => {
  it('property breakdown funnel with 0 events returns steps: [] and aggregate_steps with N zero-count entries', async () => {
    // When there are no events, there are no breakdown groups either,
    // so steps (per-breakdown) is empty. aggregate_steps must still return N zero-count steps.
    const projectId = randomUUID();

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Sign Up' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-10),
      date_to: dateOffset(-8),
      breakdown_property: 'browser',
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    // No breakdown groups exist, so per-breakdown steps is empty
    expect(r.steps).toHaveLength(0);

    // aggregate_steps must return N zero-count steps
    expect(r.aggregate_steps).toHaveLength(2);
    for (const step of r.aggregate_steps) {
      expect(step.count).toBe(0);
      expect(step.conversion_rate).toBe(0);
      expect(step.drop_off).toBe(0);
      expect(step.drop_off_rate).toBe(0);
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }

    expect(r.aggregate_steps[0].label).toBe('Sign Up');
    expect(r.aggregate_steps[0].event_name).toBe('signup');
    expect(r.aggregate_steps[1].label).toBe('Purchase');
    expect(r.aggregate_steps[1].event_name).toBe('purchase');
  });
});

// ── Zero events — cohort breakdown funnel ────────────────────────────────────

describe('queryFunnel — zero events: cohort breakdown', () => {
  it('cohort breakdown funnel with 0 events returns per-cohort zero steps and zero aggregate_steps', async () => {
    const projectId = randomUUID();

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
        { event_name: 'signup', label: 'Sign Up' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-10),
      date_to: dateOffset(-8),
      breakdown_cohort_ids: [premiumCohort, freeCohort],
    });

    expect(result.breakdown).toBe(true);
    const r = result as Extract<typeof result, { breakdown: true }>;

    // Each cohort returns N zero-count steps
    const premiumSteps = r.steps.filter((s) => s.breakdown_value === 'Premium');
    const freeSteps = r.steps.filter((s) => s.breakdown_value === 'Free');

    expect(premiumSteps).toHaveLength(2);
    expect(freeSteps).toHaveLength(2);

    for (const step of [...premiumSteps, ...freeSteps]) {
      expect(step.count).toBe(0);
      expect(step.conversion_rate).toBe(0);
    }

    // aggregate_steps must also return N zero-count steps
    expect(r.aggregate_steps).toHaveLength(2);
    for (const step of r.aggregate_steps) {
      expect(step.count).toBe(0);
      expect(step.conversion_rate).toBe(0);
      expect(step.drop_off).toBe(0);
      expect(step.drop_off_rate).toBe(0);
      expect(step.avg_time_to_convert_seconds).toBeNull();
    }

    expect(r.aggregate_steps[0].label).toBe('Sign Up');
    expect(r.aggregate_steps[0].event_name).toBe('signup');
    expect(r.aggregate_steps[1].label).toBe('Purchase');
    expect(r.aggregate_steps[1].event_name).toBe('purchase');
  });
});
