import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryFunnel — sub-second conversion window (millisecond precision)', () => {
  /**
   * Regression test for issue #397.
   *
   * Previously buildWindowFunnelExpr() used toDateTime(timestamp) which truncates to
   * second precision. Two events within the same second were treated as simultaneous,
   * breaking ordered/strict funnels with tight windows.
   *
   * Fix: use toUInt64(toUnixTimestamp64Milli(timestamp)) with {window:UInt64} * 1000
   * so windowFunnel receives a millisecond-precision UInt64 timestamp and the window
   * in milliseconds. windowFunnel supports UInt64 since ClickHouse 19.8.
   */

  it('ordered funnel: counts conversion when two steps occur within 1 second (200ms apart)', async () => {
    const projectId = randomUUID();
    const personConverted = randomUUID();
    const personMissed = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // personConverted: step_a at T=0ms, step_b at T+200ms — both within 1s window
      buildEvent({
        project_id: projectId,
        person_id: personConverted,
        distinct_id: 'user-converted',
        event_name: 'step_a',
        timestamp: new Date(now - 10_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personConverted,
        distinct_id: 'user-converted',
        event_name: 'step_b',
        timestamp: new Date(now - 10_000 + 200).toISOString(), // 200ms later
      }),

      // personMissed: step_a at T=0ms, step_b at T+2000ms — outside 1s window
      buildEvent({
        project_id: projectId,
        person_id: personMissed,
        distinct_id: 'user-missed',
        event_name: 'step_a',
        timestamp: new Date(now - 10_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personMissed,
        distinct_id: 'user-missed',
        event_name: 'step_b',
        timestamp: new Date(now - 10_000 + 2_000).toISOString(), // 2000ms later — outside 1s window
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_value: 1,
      conversion_window_unit: 'second',
      conversion_window_days: 1,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'ordered',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(2); // both entered step A
    expect(r.steps[1].count).toBe(1); // only personConverted completed step B within 1s
  });

  it('strict funnel: counts conversion when two steps occur within 1 second (500ms apart)', async () => {
    const projectId = randomUUID();
    const personConverted = randomUUID();
    const personMissed = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // personConverted: step_a then step_b 500ms later — within 1s window, strict order
      buildEvent({
        project_id: projectId,
        person_id: personConverted,
        distinct_id: 'strict-converted',
        event_name: 'step_a',
        timestamp: new Date(now - 20_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personConverted,
        distinct_id: 'strict-converted',
        event_name: 'step_b',
        timestamp: new Date(now - 20_000 + 500).toISOString(), // 500ms later
      }),

      // personMissed: step_a then step_b 1500ms later — outside 1s window
      buildEvent({
        project_id: projectId,
        person_id: personMissed,
        distinct_id: 'strict-missed',
        event_name: 'step_a',
        timestamp: new Date(now - 20_000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personMissed,
        distinct_id: 'strict-missed',
        event_name: 'step_b',
        timestamp: new Date(now - 20_000 + 1_500).toISOString(), // 1500ms later — outside 1s window
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_value: 1,
      conversion_window_unit: 'second',
      conversion_window_days: 1,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      funnel_order_type: 'strict',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    expect(r.steps[0].count).toBe(2); // both entered step A
    expect(r.steps[1].count).toBe(1); // only personConverted completed step B within 1s
  });
});
