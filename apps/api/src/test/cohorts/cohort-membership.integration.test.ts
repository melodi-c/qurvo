import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import {
  countCohortMembers,
  countCohortMembersFromTable,
  queryCohortSizeHistory,
} from '../../cohorts/cohorts.query';
import type { CohortConditionGroup } from '@qurvo/db';
import { compileExprToSql } from '@qurvo/ch-query';
import { resolvedPerson } from '@qurvo/cohort-query';
import { materializeCohort, insertStaticCohortMembers } from './helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
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

// ── Cohort reference condition (type: 'cohort') ────────────────────────────

describe('countCohortMembers — cohort reference condition', () => {
  it('in cohort (negated=false): returns only members of referenced cohort', async () => {
    const projectId = randomUUID();
    const refCohortId = randomUUID();
    const personPremium = randomUUID();
    const personFree = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPremium,
        distinct_id: 'premium',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFree,
        distinct_id: 'free',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Materialize a "premium" cohort
    await materializeCohort(ctx.ch, projectId, refCohortId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    });

    // Query: persons IN that cohort
    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'cohort', cohort_id: refCohortId, negated: false },
      ],
    });

    expect(count).toBe(1); // only personPremium
  });

  it('not in cohort (negated=true): returns persons NOT in referenced cohort', async () => {
    const projectId = randomUUID();
    const refCohortId = randomUUID();
    const personPremium = randomUUID();
    const personFreeA = randomUUID();
    const personFreeB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPremium,
        distinct_id: 'premium',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFreeA,
        distinct_id: 'free-a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFreeB,
        distinct_id: 'free-b',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Materialize a "premium" cohort (1 member)
    await materializeCohort(ctx.ch, projectId, refCohortId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    });

    // Query: persons NOT IN that cohort
    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'cohort', cohort_id: refCohortId, negated: true },
      ],
    });

    expect(count).toBe(2); // personFreeA + personFreeB
  });

  it('static cohort ref (negated=false): reads from person_static_cohort', async () => {
    const projectId = randomUUID();
    const staticCohortId = randomUUID();
    const personInStatic = randomUUID();
    const personNotInStatic = randomUUID();

    // Both persons appear in ClickHouse events (so they are visible)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personInStatic,
        distinct_id: 'in-static',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personNotInStatic,
        distinct_id: 'not-in-static',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Insert only personInStatic into the static cohort table
    await insertStaticCohortMembers(ctx.ch, projectId, staticCohortId, [personInStatic]);

    // Build definition with is_static pre-stamped (simulating service enrichment)
    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'cohort', cohort_id: staticCohortId, negated: false, is_static: true },
      ],
    };

    const count = await countCohortMembers(ctx.ch, projectId, definition);
    expect(count).toBe(1); // only personInStatic
  });

  it('static cohort ref (negated=true): excludes members of static cohort', async () => {
    const projectId = randomUUID();
    const staticCohortId = randomUUID();
    const personInStatic = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personInStatic,
        distinct_id: 'in-static',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'b',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(0),
      }),
    ]);

    await insertStaticCohortMembers(ctx.ch, projectId, staticCohortId, [personInStatic]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'cohort', cohort_id: staticCohortId, negated: true, is_static: true },
      ],
    };

    const count = await countCohortMembers(ctx.ch, projectId, definition);
    expect(count).toBe(2); // personA + personB
  });

  it('negated cohort AND property: intersects correctly', async () => {
    const projectId = randomUUID();
    const refCohortId = randomUUID();
    const personPremiumGold = randomUUID();
    const personFreeGold = randomUUID();
    const personFreeSilver = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPremiumGold,
        distinct_id: 'premium-gold',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium', tier: 'gold' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFreeGold,
        distinct_id: 'free-gold',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free', tier: 'gold' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFreeSilver,
        distinct_id: 'free-silver',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free', tier: 'silver' }),
        timestamp: msAgo(0),
      }),
    ]);

    // Materialize a "premium" cohort (1 member: personPremiumGold)
    await materializeCohort(ctx.ch, projectId, refCohortId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    });

    // Query: NOT in premium cohort AND tier = gold
    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'cohort', cohort_id: refCohortId, negated: true },
        { type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' },
      ],
    });

    expect(count).toBe(1); // only personFreeGold (free + gold)
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
      clickhouse_settings: { async_insert: 0 },
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
      clickhouse_settings: { async_insert: 0 },
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

// NOTE: StaticCohortsService is a NestJS injectable requiring the full app
// module (Drizzle DB, CohortsService, etc.). These integration tests use bare
// container clients from @qurvo/testing, so we replicate the service's
// resolveEmailsToPersonIds query directly. The queries below mirror the SQL in
// StaticCohortsService.resolveEmailsToPersonIds (including lower() and resolvedPerson()).

const RESOLVED_PERSON_SQL = compileExprToSql(resolvedPerson()).sql;

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

    // Resolve emails to person_ids — mirrors StaticCohortsService.resolveEmailsToPersonIds
    // (uses lower() on both sides for case-insensitive matching)
    const emails = ['alice@example.com', 'unknown@example.com'];
    const normalizedEmails = emails.map((e) => e.toLowerCase());
    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT ${RESOLVED_PERSON_SQL} AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND lower(JSONExtractString(user_properties, 'email')) IN {emails:Array(String)}`,
      query_params: { project_id: projectId, emails: normalizedEmails },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    // alice resolves, unknown does not
    expect(rows.length).toBe(1);
    expect(rows[0].resolved_person_id).toBe(personA);
  });

  it('resolves multiple known emails and ignores unknown', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

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

    const emails = ['alice@example.com', 'bob@example.com', 'nobody@example.com'];
    const normalizedEmails = emails.map((e) => e.toLowerCase());
    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT ${RESOLVED_PERSON_SQL} AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND lower(JSONExtractString(user_properties, 'email')) IN {emails:Array(String)}`,
      query_params: { project_id: projectId, emails: normalizedEmails },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    expect(rows.length).toBe(2);
    const resolvedIds = rows.map((r) => r.resolved_person_id).sort();
    expect(resolvedIds).toEqual([personA, personB].sort());
  });

  it('resolves uppercase CSV email to lowercase stored email (case-insensitive lookup)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    // Stored email is lowercase
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'alice-upper-did',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'alice@example.com' }),
        timestamp: msAgo(500),
      }),
    ]);

    // CSV provides email in uppercase — must still resolve
    const emailsFromCsv = ['ALICE@EXAMPLE.COM'];
    const normalizedEmails = emailsFromCsv.map((e) => e.toLowerCase());

    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT ${RESOLVED_PERSON_SQL} AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND lower(JSONExtractString(user_properties, 'email')) IN {emails:Array(String)}`,
      query_params: { project_id: projectId, emails: normalizedEmails },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    expect(rows.length).toBe(1);
    expect(rows[0].resolved_person_id).toBe(personA);
  });

  it('resolves mixed-case CSV email to lowercase stored email', async () => {
    const projectId = randomUUID();
    const personB = randomUUID();

    // Stored email is lowercase
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'bob-mixed-did',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'bob@domain.org' }),
        timestamp: msAgo(200),
      }),
    ]);

    // CSV provides email in mixed case
    const emailsFromCsv = ['Bob@Domain.Org'];
    const normalizedEmails = emailsFromCsv.map((e) => e.toLowerCase());

    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT ${RESOLVED_PERSON_SQL} AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND lower(JSONExtractString(user_properties, 'email')) IN {emails:Array(String)}`,
      query_params: { project_id: projectId, emails: normalizedEmails },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    expect(rows.length).toBe(1);
    expect(rows[0].resolved_person_id).toBe(personB);
  });
});

// ── resolveDistinctIdsToPersonIds (via importStaticCohortCsv path) ────────────
// Mirrors StaticCohortsService.resolveDistinctIdsToPersonIds SQL directly.

describe('importStaticCohortCsv — distinct_id resolution', () => {
  it('resolves distinct_id to person_id via ClickHouse events', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'alice-distinct',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
    ]);

    // Resolve known + unknown distinct_ids — mirrors StaticCohortsService.resolveDistinctIdsToPersonIds
    const distinctIds = ['alice-distinct', 'unknown-distinct'];
    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT
          coalesce(
            dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)),
            person_id
          ) AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND distinct_id IN {ids:Array(String)}`,
      query_params: { project_id: projectId, ids: distinctIds },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    // alice-distinct resolves, unknown-distinct does not appear
    expect(rows.length).toBe(1);
    expect(rows[0].resolved_person_id).toBe(personA);
  });

  it('resolves multiple known distinct_ids and ignores unknown', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'did-alice',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'did-bob',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(1000),
      }),
    ]);

    const distinctIds = ['did-alice', 'did-bob', 'did-nobody'];
    const result = await ctx.ch.query({
      query: `
        SELECT DISTINCT
          coalesce(
            dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)),
            person_id
          ) AS resolved_person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND distinct_id IN {ids:Array(String)}`,
      query_params: { project_id: projectId, ids: distinctIds },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ resolved_person_id: string }>();

    expect(rows.length).toBe(2);
    const resolvedIds = rows.map((r) => r.resolved_person_id).sort();
    expect(resolvedIds).toEqual([personA, personB].sort());
  });
});

// ── insertStaticMembers chunking ────────────────────────────────────────────
// Mirrors the chunked insert logic in StaticCohortsService.insertStaticMembers.
// Uses a chunk size of 5 to verify that all rows land correctly when the total
// exceeds one chunk (simulates the production CHUNK_SIZE=5_000 path at small scale).

describe('importStaticCohortCsv — chunked insert', () => {
  it('inserts all members correctly across multiple chunks', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();

    // Generate 12 person IDs (will require 3 chunks of size 5 with the test CHUNK_SIZE=5)
    const personIds = Array.from({ length: 12 }, () => randomUUID());

    // Simulate chunked insert (mirrors service logic with CHUNK_SIZE=5)
    const CHUNK_SIZE = 5;
    for (let i = 0; i < personIds.length; i += CHUNK_SIZE) {
      const chunk = personIds.slice(i, i + CHUNK_SIZE);
      await ctx.ch.insert({
        table: 'person_static_cohort',
        values: chunk.map((pid) => ({
          project_id: projectId,
          cohort_id: cohortId,
          person_id: pid,
        })),
        format: 'JSONEachRow',
        clickhouse_settings: { async_insert: 0 },
      });
    }

    // Verify all 12 rows are present in the table
    const result = await ctx.ch.query({
      query: `
        SELECT count() AS total
        FROM person_static_cohort FINAL
        WHERE project_id = {project_id:UUID}
          AND cohort_id = {cohort_id:UUID}`,
      query_params: { project_id: projectId, cohort_id: cohortId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ total: string }>();
    expect(parseInt(rows[0].total, 10)).toBe(12);
  });

  it('single chunk (count < CHUNK_SIZE) inserts correctly', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();

    // Only 3 persons — fits in one chunk
    const personIds = [randomUUID(), randomUUID(), randomUUID()];

    await ctx.ch.insert({
      table: 'person_static_cohort',
      values: personIds.map((pid) => ({
        project_id: projectId,
        cohort_id: cohortId,
        person_id: pid,
      })),
      format: 'JSONEachRow',
      clickhouse_settings: { async_insert: 0 },
    });

    const result = await ctx.ch.query({
      query: `
        SELECT count() AS total
        FROM person_static_cohort FINAL
        WHERE project_id = {project_id:UUID}
          AND cohort_id = {cohort_id:UUID}`,
      query_params: { project_id: projectId, cohort_id: cohortId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ total: string }>();
    expect(parseInt(rows[0].total, 10)).toBe(3);
  });
});

// ── countCohortMembers: empty group sentinel { type: 'AND', values: [] } → 0 ──

describe('countCohortMembers — empty group sentinel', () => {
  it('{ type: "AND", values: [] } returns 0 even when events exist', async () => {
    const projectId = randomUUID();

    // Insert events so that any miscoded "match all" would return > 0
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'sentinel-p1',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(1000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'sentinel-p2',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(500),
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, { type: 'AND', values: [] });
    expect(count).toBe(0);
  });
});
