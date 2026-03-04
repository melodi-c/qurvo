import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  msAgo,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryPersonsAtFunnelStep } from '../../persons/persons-at-funnel-step.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryPersonsAtFunnelStep', () => {
  it('3-step funnel: step=1 returns all 3, step=2 returns 2, step=3 returns 1', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // personA completes all 3 steps
    // personB completes steps 1 and 2
    // personC completes only step 1
    await insertTestEvents(ctx.ch, [
      // personA: all 3 steps
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'user-a', event_name: 'signup', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'user-a', event_name: 'onboarding', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'user-a', event_name: 'purchase', timestamp: msAgo(1000) }),
      // personB: steps 1 and 2
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'user-b', event_name: 'signup', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'user-b', event_name: 'onboarding', timestamp: msAgo(2000) }),
      // personC: step 1 only
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'user-c', event_name: 'signup', timestamp: msAgo(3000) }),
    ]);

    const steps = [
      { event_name: 'signup', label: 'Signed up' },
      { event_name: 'onboarding', label: 'Onboarded' },
      { event_name: 'purchase', label: 'Purchased' },
    ];

    const baseParams = {
      project_id: projectId,
      steps,
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    };

    // Step 1: all 3 persons reached step 1
    const r1 = await queryPersonsAtFunnelStep(ctx.ch, { ...baseParams, step: 1 });
    expect(r1.total).toBe(3);
    expect(r1.personIds).toHaveLength(3);
    expect(r1.personIds.sort()).toEqual([personA, personB, personC].sort());

    // Step 2: only personA and personB reached step 2
    const r2 = await queryPersonsAtFunnelStep(ctx.ch, { ...baseParams, step: 2 });
    expect(r2.total).toBe(2);
    expect(r2.personIds).toHaveLength(2);
    expect(r2.personIds.sort()).toEqual([personA, personB].sort());

    // Step 3: only personA reached step 3
    const r3 = await queryPersonsAtFunnelStep(ctx.ch, { ...baseParams, step: 3 });
    expect(r3.total).toBe(1);
    expect(r3.personIds).toEqual([personA]);
  });

  it('pagination with limit/offset works correctly', async () => {
    const projectId = randomUUID();
    const personIds: string[] = [];

    // Create 5 persons who all complete both funnel steps
    for (let i = 0; i < 5; i++) {
      personIds.push(randomUUID());
    }

    await insertTestEvents(ctx.ch, [
      ...personIds.map((pid, i) =>
        buildEvent({
          project_id: projectId,
          person_id: pid,
          distinct_id: `user-${i}`,
          event_name: 'signup',
          timestamp: msAgo(1000),
        }),
      ),
      ...personIds.map((pid, i) =>
        buildEvent({
          project_id: projectId,
          person_id: pid,
          distinct_id: `user-${i}`,
          event_name: 'activate',
          timestamp: msAgo(500),
        }),
      ),
    ]);

    const steps = [
      { event_name: 'signup', label: 'Signup' },
      { event_name: 'activate', label: 'Activate' },
    ];

    const baseParams = {
      project_id: projectId,
      steps,
      step: 1,
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    };

    // Page 1: limit 2, offset 0
    const page1 = await queryPersonsAtFunnelStep(ctx.ch, { ...baseParams, limit: 2, offset: 0 });
    expect(page1.total).toBe(5); // total is always full count
    expect(page1.personIds).toHaveLength(2);

    // Page 2: limit 2, offset 2
    const page2 = await queryPersonsAtFunnelStep(ctx.ch, { ...baseParams, limit: 2, offset: 2 });
    expect(page2.total).toBe(5);
    expect(page2.personIds).toHaveLength(2);

    // Page 3: limit 2, offset 4
    const page3 = await queryPersonsAtFunnelStep(ctx.ch, { ...baseParams, limit: 2, offset: 4 });
    expect(page3.total).toBe(5);
    expect(page3.personIds).toHaveLength(1);

    // No overlap between pages
    const allIds = [...page1.personIds, ...page2.personIds, ...page3.personIds];
    expect(new Set(allIds).size).toBe(5);
  });

  it('returns zero results when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryPersonsAtFunnelStep(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'never_happened_a', label: 'Step A' },
        { event_name: 'never_happened_b', label: 'Step B' },
      ],
      step: 1,
      conversion_window_days: 7,
      date_from: dateOffset(-5),
      date_to: dateOffset(-3),
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(0);
    expect(result.personIds).toHaveLength(0);
  });

  it('respects conversion window', async () => {
    const projectId = randomUUID();
    const personIn = randomUUID();
    const personOut = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personIn: steps within 1-day window
      buildEvent({ project_id: projectId, person_id: personIn, distinct_id: 'user-in', event_name: 'step_a', timestamp: msAgo(3 * DAY_MS) }),
      buildEvent({ project_id: projectId, person_id: personIn, distinct_id: 'user-in', event_name: 'step_b', timestamp: msAgo(3 * DAY_MS - 6 * 60 * 60 * 1000) }), // 6h later
      // personOut: steps outside 1-day window (2 days apart)
      buildEvent({ project_id: projectId, person_id: personOut, distinct_id: 'user-out', event_name: 'step_a', timestamp: msAgo(5 * DAY_MS) }),
      buildEvent({ project_id: projectId, person_id: personOut, distinct_id: 'user-out', event_name: 'step_b', timestamp: msAgo(3 * DAY_MS) }), // 2 days later
    ]);

    const result = await queryPersonsAtFunnelStep(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      step: 2,
      conversion_window_days: 1,
      date_from: dateOffset(-7),
      date_to: dateOffset(1),
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });

    // Only personIn completed both steps within the window
    expect(result.total).toBe(1);
    expect(result.personIds).toEqual([personIn]);
  });
});
