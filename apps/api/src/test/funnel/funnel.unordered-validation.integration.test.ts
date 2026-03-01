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
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── Unordered funnel: duplicate event names across steps ──────────────────────

describe('queryFunnel — unordered funnel duplicate event validation', () => {
  it('throws AppBadRequestException when two steps share the same event name', async () => {
    const projectId = randomUUID();

    await expect(
      queryFunnel(ctx.ch, {
        project_id: projectId,
        funnel_order_type: 'unordered',
        steps: [
          { event_name: 'click', label: 'Click 1' },
          { event_name: 'click', label: 'Click 2' },
          { event_name: 'purchase', label: 'Purchase' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        timezone: 'UTC',
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('includes the conflicting event name in the error message', async () => {
    const projectId = randomUUID();

    await expect(
      queryFunnel(ctx.ch, {
        project_id: projectId,
        funnel_order_type: 'unordered',
        steps: [
          { event_name: 'click', label: 'Click 1' },
          { event_name: 'click', label: 'Click 2' },
          { event_name: 'purchase', label: 'Purchase' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        timezone: 'UTC',
      }),
    ).rejects.toThrow(/click/);
  });

  it('throws when two OR-logic steps share an event name', async () => {
    const projectId = randomUUID();

    await expect(
      queryFunnel(ctx.ch, {
        project_id: projectId,
        funnel_order_type: 'unordered',
        steps: [
          {
            event_name: 'signup',
            event_names: ['signup', 'register'],
            label: 'Signup',
          },
          {
            event_name: 'register',
            event_names: ['register', 'onboarding'],
            label: 'Onboarding',
          },
          { event_name: 'purchase', label: 'Purchase' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        timezone: 'UTC',
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('does NOT throw when all steps have distinct event names', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user',
        event_name: 'onboarding',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'user',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'onboarding', label: 'Onboarding' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
    expect(r.steps[2].count).toBe(1);
  });

  it('does NOT throw for ordered funnel with duplicate event names (only unordered is restricted)', async () => {
    const projectId = randomUUID();

    // Ordered funnel uses windowFunnel which correctly handles duplicate events
    // via strict chronological matching — no validation error should be thrown
    await expect(
      queryFunnel(ctx.ch, {
        project_id: projectId,
        funnel_order_type: 'ordered',
        steps: [
          { event_name: 'click', label: 'Click 1' },
          { event_name: 'click', label: 'Click 2' },
          { event_name: 'purchase', label: 'Purchase' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        timezone: 'UTC',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw for strict funnel with duplicate event names (only unordered is restricted)', async () => {
    const projectId = randomUUID();

    await expect(
      queryFunnel(ctx.ch, {
        project_id: projectId,
        funnel_order_type: 'strict',
        steps: [
          { event_name: 'click', label: 'Click 1' },
          { event_name: 'click', label: 'Click 2' },
          { event_name: 'purchase', label: 'Purchase' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        timezone: 'UTC',
      }),
    ).resolves.toBeDefined();
  });

  it('validates correctly with only 2 steps sharing the same event name', async () => {
    const projectId = randomUUID();

    await expect(
      queryFunnel(ctx.ch, {
        project_id: projectId,
        funnel_order_type: 'unordered',
        steps: [
          { event_name: 'purchase', label: 'Purchase 1' },
          { event_name: 'purchase', label: 'Purchase 2' },
        ],
        conversion_window_days: 7,
        date_from: dateOffset(-1),
        date_to: dateOffset(1),
        timezone: 'UTC',
      }),
    ).rejects.toThrow(AppBadRequestException);
  });
});
