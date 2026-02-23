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
import {
  countCohortMembers,
  countCohortMembersFromTable,
  type CohortFilterInput,
} from '../../cohorts/cohorts.query';
import { buildCohortSubquery } from '@qurvo/cohort-query';
import { queryFunnel } from '../../funnel/funnel.query';
import { queryTrend } from '../../trend/trend.query';
import type { CohortConditionGroup } from '@qurvo/db';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── Helper: materialize cohort membership into cohort_members table ─────────

async function materializeCohort(
  ch: typeof ctx.ch,
  projectId: string,
  cohortId: string,
  definition: CohortConditionGroup,
): Promise<number> {
  const version = Date.now();
  const queryParams: Record<string, unknown> = { project_id: projectId };
  const subquery = buildCohortSubquery(definition, 0, 'project_id', queryParams);

  const insertSql = `
    INSERT INTO cohort_members (cohort_id, project_id, person_id, version)
    SELECT
      '${cohortId}' AS cohort_id,
      '${projectId}' AS project_id,
      person_id,
      ${version} AS version
    FROM (${subquery})`;

  await ch.query({ query: insertSql, query_params: queryParams });
  return version;
}

// ── Inline counting tests (previewCount fallback path) ──────────────────────

describe('countCohortMembers — person_property conditions', () => {
  it('counts persons matching eq condition on user_properties', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'premium-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'free-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    });

    expect(count).toBe(1);
  });

  it('counts persons matching neq condition', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-b',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-c',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'neq', value: 'premium' },
      ],
    });

    expect(count).toBe(2);
  });

  it('counts persons matching contains condition', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-a',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Acme Corp' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-b',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Beta Inc' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'company', operator: 'contains', value: 'Acme' },
      ],
    });

    expect(count).toBe(1);
  });
});

describe('countCohortMembers — event conditions', () => {
  it('counts persons who performed event >= N times', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId,
          person_id: personA,
          distinct_id: 'buyer-a',
          event_name: 'purchase',
          timestamp: msAgo(i * 1000),
        }),
      ),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'buyer-b',
        event_name: 'purchase',
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 2, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personA has >= 2
  });

  it('counts persons with exactly N events', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'login', timestamp: msAgo(1000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'login', timestamp: msAgo(0) }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'login', count_operator: 'eq', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personB has exactly 1
  });
});

describe('countCohortMembers — combined conditions', () => {
  it('type=AND: INTERSECT of conditions', async () => {
    const projectId = randomUUID();
    const personBoth = randomUUID();
    const personOnlyProp = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personBoth,
        distinct_id: 'both',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOnlyProp,
        distinct_id: 'only-prop',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personBoth satisfies both
  });

  it('type=OR: UNION of conditions', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'OR',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 1, time_window_days: 30 },
      ],
    });

    expect(count).toBe(2); // both satisfy at least one condition
  });
});

// ── Materialized membership tests ───────────────────────────────────────────

describe('materialized cohort membership', () => {
  it('countCohortMembersFromTable matches inline count', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    };

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'p1',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(0),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'p2',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Inline count
    const inlineCount = await countCohortMembers(ctx.ch, projectId, definition);

    // Materialize and count from table
    await materializeCohort(ctx.ch, projectId, cohortId, definition);
    const tableCount = await countCohortMembersFromTable(ctx.ch, projectId, cohortId);

    expect(inlineCount).toBe(1);
    expect(tableCount).toBe(inlineCount);
  });

  it('stale membership is replaced on recomputation', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    };

    // Insert 1 premium user
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'p1',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
    ]);

    await materializeCohort(ctx.ch, projectId, cohortId, definition);
    const count1 = await countCohortMembersFromTable(ctx.ch, projectId, cohortId);
    expect(count1).toBe(1);

    // Add 2nd premium user
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'p2',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Recompute — should pick up the new user
    await materializeCohort(ctx.ch, projectId, cohortId, definition);
    const count2 = await countCohortMembersFromTable(ctx.ch, projectId, cohortId);
    expect(count2).toBe(2);
  });
});

// ── Integration with funnel and trend (using CohortFilterInput) ─────────────

describe('cohort filter integration with funnel', () => {
  it('funnel with inline cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
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
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
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
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const cohortFilter: CohortFilterInput = {
      cohort_id: randomUUID(),
      definition: {
        type: 'AND',
        values: [
          { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        ],
      },
      materialized: false,
      is_static: false,
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      cohort_filters: [cohortFilter],
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1); // only premium user
      expect(result.steps[1].count).toBe(1);
    }
  });

  it('funnel with materialized cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    await insertTestEvents(ctx.ch, [
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
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
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
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    };

    // Materialize the cohort
    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'checkout', label: 'Checkout' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      cohort_filters: [{
        cohort_id: cohortId,
        definition,
        materialized: true,
        is_static: false,
      }],
    });

    expect(result.breakdown).toBe(false);
    if (!result.breakdown) {
      expect(result.steps[0].count).toBe(1);
      expect(result.steps[1].count).toBe(1);
    }
  });
});

// ── Date operators ──────────────────────────────────────────────────────────

describe('countCohortMembers — date operators', () => {
  it('is_date_before: filters persons by signup_date', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'early-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-01-15' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'late-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-06-20' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_before', value: '2025-03-01' },
      ],
    });

    expect(count).toBe(1);
  });

  it('is_date_after: filters persons by signup_date', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'early-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-01-15' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'late-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-06-20' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_after', value: '2025-03-01' },
      ],
    });

    expect(count).toBe(1);
  });

  it('is_date_exact: matches by day regardless of time', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'target-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-15T14:30:00Z' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'other-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-16' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_exact', value: '2025-03-15' },
      ],
    });

    expect(count).toBe(1);
  });
});

// ── Multi-substring operators ───────────────────────────────────────────────

describe('countCohortMembers — multi-substring operators', () => {
  it('contains_multi: matches persons with any of the substrings', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'gmail-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'alice@gmail.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'yahoo-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'bob@yahoo.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'outlook-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'carol@outlook.com' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'email', operator: 'contains_multi', values: ['gmail', 'yahoo'] },
      ],
    });

    expect(count).toBe(2);
  });

  it('not_contains_multi: excludes persons with any of the substrings', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'gmail-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'alice@gmail.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'yahoo-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'bob@yahoo.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'outlook-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'carol@outlook.com' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'email', operator: 'not_contains_multi', values: ['gmail', 'yahoo'] },
      ],
    });

    expect(count).toBe(1);
  });
});

// ── Event aggregation math ──────────────────────────────────────────────────

describe('countCohortMembers — event aggregation math', () => {
  it('sum(revenue) >= threshold', async () => {
    const projectId = randomUUID();
    const bigSpender = randomUUID();
    const smallSpender = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: bigSpender,
        distinct_id: 'big',
        event_name: 'purchase',
        properties: JSON.stringify({ revenue: '500' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: bigSpender,
        distinct_id: 'big',
        event_name: 'purchase',
        properties: JSON.stringify({ revenue: '700' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: smallSpender,
        distinct_id: 'small',
        event_name: 'purchase',
        properties: JSON.stringify({ revenue: '50' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'purchase',
          count_operator: 'gte',
          count: 1000,
          time_window_days: 30,
          aggregation_type: 'sum',
          aggregation_property: 'properties.revenue',
        },
      ],
    });

    expect(count).toBe(1); // only bigSpender (500+700=1200 >= 1000)
  });

  it('avg(price) >= threshold', async () => {
    const projectId = randomUUID();
    const highAvg = randomUUID();
    const lowAvg = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: highAvg,
        distinct_id: 'high',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '100' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: highAvg,
        distinct_id: 'high',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '200' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowAvg,
        distinct_id: 'low',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '10' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowAvg,
        distinct_id: 'low',
        event_name: 'purchase',
        properties: JSON.stringify({ price: '20' }),
        user_properties: JSON.stringify({ role: 'buyer' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'purchase',
          count_operator: 'gte',
          count: 50,
          time_window_days: 30,
          aggregation_type: 'avg',
          aggregation_property: 'properties.price',
        },
      ],
    });

    expect(count).toBe(1); // only highAvg (avg=150 >= 50)
  });

  it('max(score) <= threshold', async () => {
    const projectId = randomUUID();
    const lowScorer = randomUUID();
    const highScorer = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: lowScorer,
        distinct_id: 'low',
        event_name: 'game_round',
        properties: JSON.stringify({ score: '30' }),
        user_properties: JSON.stringify({ role: 'player' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: lowScorer,
        distinct_id: 'low',
        event_name: 'game_round',
        properties: JSON.stringify({ score: '45' }),
        user_properties: JSON.stringify({ role: 'player' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: highScorer,
        distinct_id: 'high',
        event_name: 'game_round',
        properties: JSON.stringify({ score: '80' }),
        user_properties: JSON.stringify({ role: 'player' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        {
          type: 'event',
          event_name: 'game_round',
          count_operator: 'lte',
          count: 50,
          time_window_days: 30,
          aggregation_type: 'max',
          aggregation_property: 'properties.score',
        },
      ],
    });

    expect(count).toBe(1); // only lowScorer (max=45 <= 50)
  });

  it('backward compat: no aggregation_type defaults to count()', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId,
          person_id: personA,
          distinct_id: 'a',
          event_name: 'click',
          user_properties: JSON.stringify({ role: 'user' }),
          timestamp: msAgo(i * 1000),
        }),
      ),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: 'click',
        user_properties: JSON.stringify({ role: 'user' }),
        timestamp: msAgo(0),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'click', count_operator: 'gte', count: 2, time_window_days: 30 },
      ],
    });

    expect(count).toBe(1); // only personA has >= 2
  });
});

describe('cohort filter integration with trend', () => {
  it('trend with inline cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      cohort_filters: [{
        cohort_id: randomUUID(),
        definition: {
          type: 'AND',
          values: [
            { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
          ],
        },
        materialized: false,
      is_static: false,
      }],
    });

    if (!result.compare && !result.breakdown) {
      expect(result.series[0].data[0]?.value).toBe(1);
    }
  });

  it('trend with materialized cohort_filters restricts to cohort members', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(3000),
      }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      cohort_filters: [{
        cohort_id: cohortId,
        definition,
        materialized: true,
        is_static: false,
      }],
    });

    if (!result.compare && !result.breakdown) {
      expect(result.series[0].data[0]?.value).toBe(1);
    }
  });
});
