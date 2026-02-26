import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── P2: Inline Event Combination (OR-logic) ──────────────────────────────────

describe('queryFunnel — inline event combination (OR-logic)', () => {
  it('matches multiple event names within a single step using event_names', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Person A: click_signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'click_signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Person B: submit_signup → purchase
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'submit_signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Person C: only page_view → purchase (neither signup event)
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'page_view',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'c',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'click_signup',
          event_names: ['click_signup', 'submit_signup'],
          label: 'Any Signup',
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const rOr = result as Extract<typeof result, { breakdown: false }>;
    expect(rOr.steps[0].count).toBe(2); // A + B (both signup variants)
    expect(rOr.steps[1].count).toBe(2); // both purchased
  });

  it('falls back to single event_name when event_names is empty', async () => {
    const projectId = randomUUID();
    const pid = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'signup',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    // event_names is empty array — should fall back to event_name
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', event_names: [], label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const rFb = result as Extract<typeof result, { breakdown: false }>;
    expect(rFb.steps[0].count).toBe(1);
    expect(rFb.steps[1].count).toBe(1);
  });

  it('works with event_names in unordered mode', async () => {
    const projectId = randomUUID();
    const pid = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'checkout_start',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: 'user',
        event_name: 'payment_submit',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'checkout_start',
          event_names: ['checkout_start', 'checkout_begin'],
          label: 'Start Checkout',
        },
        {
          event_name: 'payment_submit',
          event_names: ['payment_submit', 'payment_complete'],
          label: 'Payment',
        },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'unordered',
    });

    expect(result.breakdown).toBe(false);
    const rUn = result as Extract<typeof result, { breakdown: false }>;
    expect(rUn.steps[0].count).toBe(1);
    expect(rUn.steps[1].count).toBe(1);
  });
});
