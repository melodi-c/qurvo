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

// ── neq / not_contains with missing JSON property ─────────────────────────────
//
// Root cause: JSONExtractString(properties, 'plan') returns '' when the key is
// absent. Without a JSONHas guard, '' != 'pro' → true, so users without the
// property incorrectly pass the filter.
// After the fix: JSONHas(properties, 'plan') AND ... ensures missing-key events
// are excluded.

describe('queryFunnel — neq filter excludes users whose property is absent', () => {
  it('step filter neq: user without the property does NOT pass the filter', async () => {
    // personA: events with properties.plan = 'free' → should pass neq 'pro'
    // personB: events WITHOUT properties.plan key → should NOT pass neq 'pro'
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: has plan = 'free', should pass filter plan neq 'pro'
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(2000),
      }),
      // personB: no plan property at all → must NOT pass filter plan neq 'pro'
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'signup',
        properties: JSON.stringify({ other: 'value' }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        properties: JSON.stringify({ other: 'value' }),
        timestamp: msAgo(2500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.plan', operator: 'neq', value: 'pro' }],
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
    // Only personA (plan=free) should enter the funnel.
    // personB has no plan key — must be excluded by the neq filter.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('step filter neq: user with the exact target value (plan=pro) is excluded', async () => {
    // personPro: plan = 'pro' → must NOT pass neq 'pro'
    // personFree: plan = 'free' → must pass neq 'pro'
    const projectId = randomUUID();
    const personPro = randomUUID();
    const personFree = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: 'pro-user',
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'pro' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: 'pro-user',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'pro' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFree,
        distinct_id: 'free-user',
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFree,
        distinct_id: 'free-user',
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
          filters: [{ property: 'properties.plan', operator: 'neq', value: 'pro' }],
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
    // Only personFree passes (plan != 'pro').
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

describe('queryFunnel — not_contains filter excludes users whose property is absent', () => {
  it('step filter not_contains: user without the property does NOT pass the filter', async () => {
    // personA: properties.tag = 'analytics' → passes not_contains 'admin'
    // personB: no tag property at all → must NOT pass not_contains 'admin'
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: has tag = 'analytics', should pass filter tag not_contains 'admin'
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'view',
        properties: JSON.stringify({ tag: 'analytics' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        properties: JSON.stringify({ tag: 'analytics' }),
        timestamp: msAgo(2000),
      }),
      // personB: no tag property at all → must NOT pass filter tag not_contains 'admin'
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'view',
        properties: JSON.stringify({ other: 'data' }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        properties: JSON.stringify({ other: 'data' }),
        timestamp: msAgo(2500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'view',
          label: 'View',
          filters: [{ property: 'properties.tag', operator: 'not_contains', value: 'admin' }],
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
    // Only personA (tag=analytics, doesn't contain 'admin') should enter the funnel.
    // personB has no tag key — must be excluded by the not_contains filter.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});
