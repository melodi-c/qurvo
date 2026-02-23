import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  msAgo,
  type ContainerContext,
} from '@qurvo/testing';
import {
  countCohortMembers,
  countCohortMembersFromTable,
  queryCohortSizeHistory,
} from '../../cohorts/cohorts.query';
import type { CohortConditionGroup } from '@qurvo/db';
import { materializeCohort } from './helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── Combined conditions ─────────────────────────────────────────────────────

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

// ── Materialized membership ─────────────────────────────────────────────────

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

// ── Cohort size history ─────────────────────────────────────────────────────

describe('queryCohortSizeHistory', () => {
  it('returns history points sorted by date ASC', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await ctx.ch.insert({
      table: 'cohort_membership_history',
      values: [
        { project_id: projectId, cohort_id: cohortId, date: yesterday, count: 10 },
        { project_id: projectId, cohort_id: cohortId, date: today, count: 15 },
      ],
      format: 'JSONEachRow',
    });

    const history = await queryCohortSizeHistory(ctx.ch, projectId, cohortId, 30);
    expect(history.length).toBe(2);
    expect(history[0].date).toBe(yesterday);
    expect(history[0].count).toBe(10);
    expect(history[1].date).toBe(today);
    expect(history[1].count).toBe(15);
  });

  it('filters by days parameter', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

    await ctx.ch.insert({
      table: 'cohort_membership_history',
      values: [
        { project_id: projectId, cohort_id: cohortId, date: oldDate, count: 5 },
        { project_id: projectId, cohort_id: cohortId, date: today, count: 20 },
      ],
      format: 'JSONEachRow',
    });

    const history = await queryCohortSizeHistory(ctx.ch, projectId, cohortId, 7);
    expect(history.length).toBe(1);
    expect(history[0].date).toBe(today);
  });

  it('returns empty array for no history', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();

    const history = await queryCohortSizeHistory(ctx.ch, projectId, cohortId, 30);
    expect(history).toEqual([]);
  });
});

// ── Static cohort CSV import ────────────────────────────────────────────────

describe('importStaticCohortCsv — email resolution', () => {
  it('resolves email to person_id via ClickHouse events', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Insert events so persons exist in ClickHouse
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'alice-did',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'alice@example.com' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'bob-did',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'bob@example.com' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Resolve emails to person_ids via ClickHouse
    const emails = ['alice@example.com', 'unknown@example.com'];
    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT person_id AS resolved_person_id
        FROM events FINAL
        WHERE project_id = {project_id:UUID}
          AND JSONExtractString(user_properties, 'email') IN {emails:Array(String)}`,
      query_params: { project_id: projectId, emails },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    // alice resolves, unknown does not
    expect(rows.length).toBe(1);
    expect(rows[0].resolved_person_id).toBe(personA);
  });
});
