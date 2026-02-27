import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  msAgo,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { queryPaths } from '../../analytics/paths/paths.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryPaths — basic transitions', () => {
  it('returns transitions and top paths for a simple sequence', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: pageview → signup → purchase
    // personB: pageview → signup → onboarding
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'onboarding', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
    });

    // Step 1: pageview → signup (2 users)
    const step1 = result.transitions.filter((t) => t.step === 1);
    expect(step1).toHaveLength(1);
    expect(step1[0].source).toBe('pageview');
    expect(step1[0].target).toBe('signup');
    expect(step1[0].person_count).toBe(2);

    // Step 2: signup → purchase (1), signup → onboarding (1)
    const step2 = result.transitions.filter((t) => t.step === 2);
    expect(step2).toHaveLength(2);
    const toPurchase = step2.find((t) => t.target === 'purchase');
    const toOnboarding = step2.find((t) => t.target === 'onboarding');
    expect(toPurchase?.person_count).toBe(1);
    expect(toOnboarding?.person_count).toBe(1);

    // Top paths
    expect(result.top_paths).toHaveLength(2);
    expect(result.top_paths.every((tp) => tp.person_count === 1)).toBe(true);
  });

  it('compacts consecutive duplicate events', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // pageview → pageview → pageview → signup → purchase
    // should compact to: pageview → signup → purchase
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(5000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(4000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'purchase', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
    });

    // Should see pageview → signup, signup → purchase (compacted)
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions[0].source).toBe('pageview');
    expect(result.transitions[0].target).toBe('signup');
    expect(result.transitions[1].source).toBe('signup');
    expect(result.transitions[1].target).toBe('purchase');

    expect(result.top_paths).toHaveLength(1);
    expect(result.top_paths[0].path).toEqual(['pageview', 'signup', 'purchase']);
  });

  it('returns empty result when no events match', async () => {
    const projectId = randomUUID();

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-5),
      date_to: dateOffset(-3),
      step_limit: 5,
    });

    expect(result.transitions).toHaveLength(0);
    expect(result.top_paths).toHaveLength(0);
  });
});

describe('queryPaths — start and end event filtering', () => {
  it('filters paths by start event', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // pageview → browse → signup → purchase
    // With start_event=signup: signup → purchase
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(4000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'browse', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'purchase', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      start_event: 'signup',
    });

    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].source).toBe('signup');
    expect(result.transitions[0].target).toBe('purchase');
  });

  it('filters paths by end event', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // pageview → browse → signup → purchase
    // With end_event=signup: pageview → browse → signup
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(4000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'browse', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'purchase', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      end_event: 'signup',
    });

    // Should see: pageview → browse, browse → signup
    expect(result.transitions).toHaveLength(2);
    const sources = result.transitions.map((t) => t.source);
    expect(sources).toContain('pageview');
    expect(sources).toContain('browse');
    // purchase should NOT appear
    const allEvents = result.transitions.flatMap((t) => [t.source, t.target]);
    expect(allEvents).not.toContain('purchase');
  });
});

describe('queryPaths — exclusions', () => {
  it('excludes specified events from paths', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // pageview → tooltip_shown → signup → purchase
    // Exclude tooltip_shown: pageview → signup → purchase
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(4000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'tooltip_shown', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'purchase', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      exclusions: ['tooltip_shown'],
    });

    const allEvents = result.transitions.flatMap((t) => [t.source, t.target]);
    expect(allEvents).not.toContain('tooltip_shown');
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions[0].source).toBe('pageview');
    expect(result.transitions[0].target).toBe('signup');
    expect(result.transitions[1].source).toBe('signup');
    expect(result.transitions[1].target).toBe('purchase');
  });
});

describe('queryPaths — step limit', () => {
  it('respects step_limit parameter', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // 6-event sequence: a → b → c → d → e → f
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'step_a', timestamp: msAgo(6000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'step_b', timestamp: msAgo(5000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'step_c', timestamp: msAgo(4000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'step_d', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'step_e', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: 'step_f', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 3,
    });

    // With step_limit=3, path is truncated to [step_a, step_b, step_c]
    // Transitions: step_a→step_b (step 1), step_b→step_c (step 2)
    expect(result.transitions.length).toBeLessThanOrEqual(2);
    const maxStep = Math.max(...result.transitions.map((t) => t.step));
    expect(maxStep).toBeLessThanOrEqual(3);

    // step_d, step_e, step_f should NOT appear
    const allEvents = result.transitions.flatMap((t) => [t.source, t.target]);
    expect(allEvents).not.toContain('step_d');
    expect(allEvents).not.toContain('step_e');
    expect(allEvents).not.toContain('step_f');
  });

  it('handles step_limit > 255 correctly (UInt16 range)', async () => {
    // Regression test: previously step_limit was typed as UInt8 in ClickHouse params,
    // causing silent truncation mod 256 for values > 255.
    // With step_limit=300, UInt8 would wrap to 44 (300 % 256), truncating paths incorrectly.
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: a simple 3-step path
    // personB: a different 3-step path
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'start', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'middle', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'end_a', timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'start', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'middle', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'end_b', timestamp: msAgo(1000) }),
    ]);

    // step_limit=300 is above the UInt8 max (255) — must not cause truncation
    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 300,
    });

    // All 3-step paths must be preserved; step 1 and step 2 must be present
    const step1 = result.transitions.filter((t) => t.step === 1);
    const step2 = result.transitions.filter((t) => t.step === 2);
    expect(step1).toHaveLength(1);
    expect(step1[0].source).toBe('start');
    expect(step1[0].target).toBe('middle');
    expect(step1[0].person_count).toBe(2);
    expect(step2).toHaveLength(2);

    // top_paths must include both full 3-step paths
    expect(result.top_paths).toHaveLength(2);
    for (const tp of result.top_paths) {
      expect(tp.path).toHaveLength(3);
    }
  });
});

describe('queryPaths — min_persons filter', () => {
  it('filters out transitions below min_persons threshold', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // personA & personB: pageview → signup (common path)
    // personC: pageview → browse (unique path)
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'browse', timestamp: msAgo(2000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      min_persons: 2,
    });

    // Only pageview → signup should survive (2 users)
    // pageview → browse (1 user) should be filtered
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].source).toBe('pageview');
    expect(result.transitions[0].target).toBe('signup');
    expect(result.transitions[0].person_count).toBe(2);
  });
});

describe('queryPaths — path cleaning rules', () => {
  it('applies regex cleaning rules to event names', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // /product/123 → /product/456 → /checkout
    // With cleaning rule: /product/\d+ → "Product page"
    // After compact: Product page → /checkout
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: '/product/123', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: '/product/456', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: '/checkout', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      path_cleaning_rules: [
        { regex: '/product/\\d+', alias: 'Product page' },
      ],
    });

    // After cleaning + compact: Product page → /checkout
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].source).toBe('Product page');
    expect(result.transitions[0].target).toBe('/checkout');
  });
});

describe('queryPaths — wildcard groups', () => {
  it('applies wildcard grouping to event names', async () => {
    const projectId = randomUUID();
    const person = randomUUID();

    // /docs/api → /docs/guides → /pricing
    // Wildcard: /docs/* → "Documentation"
    // After compact: Documentation → /pricing
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: '/docs/api', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: '/docs/guides', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'a', event_name: '/pricing', timestamp: msAgo(1000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      wildcard_groups: [
        { pattern: '/docs/*', alias: 'Documentation' },
      ],
    });

    // After wildcard + compact: Documentation → /pricing
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].source).toBe('Documentation');
    expect(result.transitions[0].target).toBe('/pricing');
  });
});

describe('queryPaths — project isolation', () => {
  it('does not mix events from different projects', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const person = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectA, person_id: person, distinct_id: 'a', event_name: 'pageview', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectA, person_id: person, distinct_id: 'a', event_name: 'signup', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectB, person_id: person, distinct_id: 'a', event_name: 'other_event', timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectB, person_id: person, distinct_id: 'a', event_name: 'different', timestamp: msAgo(2000) }),
    ]);

    const result = await queryPaths(ctx.ch, {
      project_id: projectA,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
    });

    const allEvents = result.transitions.flatMap((t) => [t.source, t.target]);
    expect(allEvents).not.toContain('other_event');
    expect(allEvents).not.toContain('different');
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].source).toBe('pageview');
    expect(result.transitions[0].target).toBe('signup');
  });
});

// ── cohort_filters ────────────────────────────────────────────────────────────

describe('queryPaths — cohort filters', () => {
  it('inline cohort filter restricts paths to cohort members only', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // premiumUser: pageview → signup → purchase
    // freeUser:   pageview → signup → browse
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'pageview',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'pageview',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'browse',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryPaths(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      step_limit: 5,
      cohort_filters: [cohortFilter],
    });

    // Only premium user's path should appear: pageview → signup → purchase
    // free user's path (browse) must not appear
    const allTargets = result.transitions.map((t) => t.target);
    expect(allTargets).toContain('signup');
    expect(allTargets).toContain('purchase');
    expect(allTargets).not.toContain('browse');

    // All transitions should belong to the premium user only (person_count = 1)
    for (const t of result.transitions) {
      expect(t.person_count).toBe(1);
    }
  });
});
