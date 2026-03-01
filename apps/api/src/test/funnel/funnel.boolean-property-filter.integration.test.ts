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

// ── boolean JSON property eq/neq filters ──────────────────────────────────────
//
// Root cause: JSONExtractString returns '' for boolean JSON values (true/false).
// Without the fix, `properties.active = 'true'` never matches `{"active": true}`.
// After the fix: OR condition with JSONExtractRaw covers boolean/number values.

describe('queryFunnel — eq filter matches boolean JSON properties', () => {
  it('step filter eq true: event with {"active": true} passes eq "true" filter', async () => {
    const projectId = randomUUID();
    const personActive = randomUUID();
    const personInactive = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personActive: active = true (boolean) → should pass eq 'true'
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: 'user-active',
        event_name: 'signup',
        properties: JSON.stringify({ active: true }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: 'user-active',
        event_name: 'purchase',
        properties: JSON.stringify({ active: true }),
        timestamp: msAgo(2000),
      }),
      // personInactive: active = false (boolean) → must NOT pass eq 'true'
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: 'user-inactive',
        event_name: 'signup',
        properties: JSON.stringify({ active: false }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: 'user-inactive',
        event_name: 'purchase',
        properties: JSON.stringify({ active: false }),
        timestamp: msAgo(2500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.active', operator: 'eq', value: 'true' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only personActive (active=true boolean) should enter the funnel.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('step filter eq false: event with {"active": false} passes eq "false" filter', async () => {
    const projectId = randomUUID();
    const personActive = randomUUID();
    const personInactive = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personActive: active = true → must NOT pass eq 'false'
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: 'user-active-b',
        event_name: 'signup',
        properties: JSON.stringify({ active: true }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: 'user-active-b',
        event_name: 'purchase',
        properties: JSON.stringify({ active: true }),
        timestamp: msAgo(2000),
      }),
      // personInactive: active = false → should pass eq 'false'
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: 'user-inactive-b',
        event_name: 'signup',
        properties: JSON.stringify({ active: false }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: 'user-inactive-b',
        event_name: 'purchase',
        properties: JSON.stringify({ active: false }),
        timestamp: msAgo(2500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.active', operator: 'eq', value: 'false' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only personInactive (active=false boolean) should enter the funnel.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('step filter eq with string value still works for string JSON properties', async () => {
    const projectId = randomUUID();
    const personPaid = randomUUID();
    const personFree = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personPaid: plan = 'paid' (string) → should pass eq 'paid'
      buildEvent({
        project_id: projectId,
        person_id: personPaid,
        distinct_id: 'user-paid',
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'paid' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPaid,
        distinct_id: 'user-paid',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'paid' }),
        timestamp: msAgo(2000),
      }),
      // personFree: plan = 'free' → must NOT pass eq 'paid'
      buildEvent({
        project_id: projectId,
        person_id: personFree,
        distinct_id: 'user-free',
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFree,
        distinct_id: 'user-free',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(2500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.plan', operator: 'eq', value: 'paid' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only personPaid (plan='paid' string) should enter the funnel.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

describe('queryFunnel — neq filter correctly excludes boolean JSON properties', () => {
  it('step filter neq true: event with {"active": true} is excluded by neq "true" filter', async () => {
    const projectId = randomUUID();
    const personActive = randomUUID();
    const personInactive = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personActive: active = true → must NOT pass neq 'true'
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: 'user-neq-a',
        event_name: 'signup',
        properties: JSON.stringify({ active: true }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: 'user-neq-a',
        event_name: 'purchase',
        properties: JSON.stringify({ active: true }),
        timestamp: msAgo(2000),
      }),
      // personInactive: active = false → should pass neq 'true'
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: 'user-neq-b',
        event_name: 'signup',
        properties: JSON.stringify({ active: false }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: 'user-neq-b',
        event_name: 'purchase',
        properties: JSON.stringify({ active: false }),
        timestamp: msAgo(2500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.active', operator: 'neq', value: 'true' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only personInactive (active=false boolean) should pass neq 'true'.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});
