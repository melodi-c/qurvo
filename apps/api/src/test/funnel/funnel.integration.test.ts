import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
  msAgo,
  type ContainerContext,
} from '@shot/testing';
import { queryFunnel } from '../../funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
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
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].count).toBe(2);
      expect(result.steps[1].count).toBe(1);
      expect(result.steps[2].count).toBe(1);
      expect(result.steps[0].conversion_rate).toBe(100);
      expect(result.steps[1].conversion_rate).toBe(50);
      expect(result.steps[2].conversion_rate).toBe(50);
    }
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
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1); // entered step A
      expect(result.steps[1].count).toBe(0); // step B out of window
    }
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
      date_from: '2020-01-01',
      date_to: '2020-01-02',
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      for (const step of result.steps) {
        expect(step.count).toBe(0);
      }
    }
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
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1);
      expect(result.steps[1].count).toBe(1);
    }
  });
});

describe('queryFunnel — with breakdown', () => {
  it('segments funnel counts by a top-level property', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'chrome-user',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'chrome-user-2',
        event_name: 'signup',
        browser: 'Chrome',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'firefox-user',
        event_name: 'signup',
        browser: 'Firefox',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
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

    expect(result.breakdown).toBe(true);
    if (result.breakdown) {
      expect(result.breakdown_property).toBe('browser');
      const chromeSteps = result.steps.filter((s) => s.breakdown_value === 'Chrome');
      const firefoxSteps = result.steps.filter((s) => s.breakdown_value === 'Firefox');
      expect(chromeSteps.find((s) => s.step === 1)?.count).toBe(2);
      expect(firefoxSteps.find((s) => s.step === 1)?.count).toBe(1);
      expect(result.aggregate_steps).toBeDefined();
      expect(result.aggregate_steps.find((s) => s.step === 1)?.count).toBe(3);
    }
  });
});
