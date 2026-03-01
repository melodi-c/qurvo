import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
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
      timezone: 'UTC',
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
    // drop_off: step 0 has 2 users, next step has 1 → 1 dropped off
    expect(r.steps[0].drop_off).toBe(1);
    expect(r.steps[0].drop_off_rate).toBe(50);
    // step 1 has 1 user, next step also has 1 → 0 dropped off
    expect(r.steps[1].drop_off).toBe(0);
    expect(r.steps[1].drop_off_rate).toBe(0);
    // last step always has drop_off = 0 and drop_off_rate = 0
    expect(r.steps[2].drop_off).toBe(0);
    expect(r.steps[2].drop_off_rate).toBe(0);
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
      timezone: 'UTC',
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
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r3 = result as Extract<typeof result, { breakdown: false }>;
    for (const step of r3.steps) {
      expect(step.count).toBe(0);
    }
  });

  it('unordered funnel respects conversion window — out-of-window events are not counted', async () => {
    const projectId = randomUUID();
    const personIn = randomUUID();
    const personOut = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personIn: step_a and step_b both within 1-day window
      buildEvent({
        project_id: projectId,
        person_id: personIn,
        distinct_id: 'user-in',
        event_name: 'step_a',
        timestamp: msAgo(3 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personIn,
        distinct_id: 'user-in',
        event_name: 'step_b',
        // 12 hours after step_a — within 1-day window
        timestamp: msAgo(3 * DAY_MS - 12 * 60 * 60 * 1000),
      }),
      // personOut: step_a and step_b outside 1-day window (2 days apart)
      buildEvent({
        project_id: projectId,
        person_id: personOut,
        distinct_id: 'user-out',
        event_name: 'step_a',
        timestamp: msAgo(5 * DAY_MS),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOut,
        distinct_id: 'user-out',
        event_name: 'step_b',
        // 2 days after step_a — outside 1-day window
        timestamp: msAgo(3 * DAY_MS),
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
      timezone: 'UTC',
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(2); // both entered step A
    expect(r.steps[1].count).toBe(1); // only personIn converted within window
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
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r4 = result as Extract<typeof result, { breakdown: false }>;
    expect(r4.steps[0].count).toBe(1);
    expect(r4.steps[1].count).toBe(1);
  });
});
