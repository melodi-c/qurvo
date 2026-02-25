import { describe, it, expect, beforeAll } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  ts,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import { eq } from 'drizzle-orm';
import { cohorts, type CohortConditionGroup } from '@qurvo/db';
import { getTestContext } from './context';
import { getCohortMembers } from './helpers/ch';
import { CohortMembershipService } from '../cohort-worker/cohort-membership.service';
import { CohortComputationService } from '../cohort-worker/cohort-computation.service';
import { COHORT_LOCK_KEY, COHORT_MAX_ERRORS } from '../constants';

let ctx: ContainerContext;
let workerApp: INestApplicationContext;
let testProject: TestProject;
let svc: CohortMembershipService;
let computation: CohortComputationService;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  workerApp = tc.app;
  testProject = tc.testProject;
  svc = workerApp.get(CohortMembershipService);
  computation = workerApp.get(CohortComputationService);
}, 120_000);

async function createCohort(
  projectId: string,
  userId: string,
  name: string,
  definition: CohortConditionGroup,
): Promise<string> {
  const [row] = await ctx.db
    .insert(cohorts)
    .values({ project_id: projectId, created_by: userId, name, definition })
    .returning({ id: cohorts.id });
  return row.id;
}

async function runCycle(): Promise<void> {
  await ctx.redis.del(COHORT_LOCK_KEY);
  await svc.runCycle();
}

describe('cohort membership', () => {
  it('property-condition cohort (eq) — persons with plan=pro in cohort', async () => {
    const projectId = testProject.projectId;
    const personPro = randomUUID();
    const personFree = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: `coh-pro-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: ts(1),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFree,
        distinct_id: `coh-free-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Pro Users', {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personPro);
    expect(members).not.toContain(personFree);
  });

  it('event-condition cohort (gte) — person with 3 purchases in cohort', async () => {
    const projectId = testProject.projectId;
    const personActive = randomUUID();
    const personInactive = randomUUID();
    const distinctActive = `coh-active-${randomUUID()}`;
    const distinctInactive = `coh-inactive-${randomUUID()}`;

    const events = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        buildEvent({
          project_id: projectId,
          person_id: personActive,
          distinct_id: distinctActive,
          event_name: 'purchase',
          user_properties: JSON.stringify({ status: 'active' }),
          timestamp: ts(1, 10 + i),
        }),
      );
    }
    events.push(
      buildEvent({
        project_id: projectId,
        person_id: personInactive,
        distinct_id: distinctInactive,
        event_name: 'purchase',
        user_properties: JSON.stringify({ status: 'inactive' }),
        timestamp: ts(1),
      }),
    );

    await insertTestEvents(ctx.ch, events);

    const cohortId = await createCohort(projectId, testProject.userId, 'Frequent Buyers', {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 3, time_window_days: 30 },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personActive);
    expect(members).not.toContain(personInactive);
  });

  it('type: AND (INTERSECT) — only persons matching ALL conditions', async () => {
    const projectId = testProject.projectId;
    const personBoth = randomUUID();
    const personOnlyProp = randomUUID();
    const distinctBoth = `coh-both-${randomUUID()}`;
    const distinctProp = `coh-prop-${randomUUID()}`;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personBoth,
        distinct_id: distinctBoth,
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: ts(1, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personBoth,
        distinct_id: distinctBoth,
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: ts(1, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOnlyProp,
        distinct_id: distinctProp,
        event_name: 'purchase',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Pro + Frequent', {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' },
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 2, time_window_days: 30 },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personBoth);
    expect(members).not.toContain(personOnlyProp);
  });

  it('type: OR (UNION) — persons matching ANY condition', async () => {
    const projectId = testProject.projectId;
    const personPropOnly = randomUUID();
    const personEventOnly = randomUUID();
    const personNeither = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPropOnly,
        distinct_id: `coh-po-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'enterprise' }),
        timestamp: ts(1),
      }),
      ...Array.from({ length: 3 }, (_, i) =>
        buildEvent({
          project_id: projectId,
          person_id: personEventOnly,
          distinct_id: `coh-eo-${randomUUID()}`,
          event_name: 'purchase',
          user_properties: JSON.stringify({ plan: 'free' }),
          timestamp: ts(1, 10 + i),
        }),
      ),
      buildEvent({
        project_id: projectId,
        person_id: personNeither,
        distinct_id: `coh-neither-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Enterprise OR Frequent', {
      type: 'OR',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'enterprise' },
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 3, time_window_days: 30 },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personPropOnly);
    expect(members).toContain(personEventOnly);
    expect(members).not.toContain(personNeither);
  });

  it('old version cleanup — only latest version rows remain', async () => {
    const projectId = testProject.projectId;
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: `coh-ver-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Version Test', {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' },
      ],
    });

    await runCycle();
    await runCycle();

    // Poll until ALTER DELETE mutation completes (same pattern as orphan GC test)
    const deadline = Date.now() + 15_000;
    let physicalCount = Infinity;
    while (Date.now() < deadline) {
      const res = await ctx.ch.query({
        query: `SELECT count() AS cnt FROM cohort_members WHERE cohort_id = {c:UUID} AND person_id = {p:UUID}`,
        query_params: { c: cohortId, p: personId },
        format: 'JSONEachRow',
      });
      physicalCount = Number((await res.json<{ cnt: string }>())[0].cnt);
      if (physicalCount <= 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personId);

    const result = await ctx.ch.query({
      query: `SELECT count() AS cnt
              FROM cohort_members FINAL
              WHERE cohort_id = {c:UUID} AND person_id = {p:UUID} AND version > 0`,
      query_params: { c: cohortId, p: personId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ cnt: string }>();
    expect(Number(rows[0].cnt)).toBe(1);
  });

  it('orphan GC — cohort_members for deleted cohort removed', async () => {
    const projectId = testProject.projectId;
    const personId = randomUUID();
    const cohortId = randomUUID();

    await ctx.ch.insert({
      table: 'cohort_members',
      values: [
        {
          cohort_id: cohortId,
          project_id: projectId,
          person_id: personId,
          version: Date.now() - 100_000,
        },
      ],
      format: 'JSONEachRow',
      clickhouse_settings: { async_insert: 0 },
    });

    let members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personId);

    await computation.gcOrphanedMemberships();

    // ALTER TABLE DELETE is an async mutation in ClickHouse — poll until it completes
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      members = await getCohortMembers(ctx.ch, projectId, cohortId);
      if (!members.includes(personId)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(members).not.toContain(personId);
  });

  it('max errors cap — cohort with too many errors excluded from recalculation', async () => {
    const projectId = testProject.projectId;
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: `coh-maxerr-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'maxerr' }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Max Errors Test', {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'maxerr' },
      ],
    });

    // Set errors_calculating to max — this cohort should be excluded from findStaleCohorts
    await ctx.db
      .update(cohorts)
      .set({ errors_calculating: COHORT_MAX_ERRORS, last_error_at: new Date() })
      .where(eq(cohorts.id, cohortId));

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).not.toContain(personId);
  });

  it('batch delete — multiple cohorts cleaned up in a single mutation', async () => {
    const projectId = testProject.projectId;
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: `coh-batch-a-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ tier: 'gold' }),
        timestamp: ts(1),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: `coh-batch-b-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ tier: 'silver' }),
        timestamp: ts(1),
      }),
    ]);

    const cohortA = await createCohort(projectId, testProject.userId, 'Gold Tier', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' }],
    });
    const cohortB = await createCohort(projectId, testProject.userId, 'Silver Tier', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'silver' }],
    });

    // Cycle 1: inserts V1 for both cohorts
    await runCycle();

    // Cycle 2: inserts V2 + batch-deletes V1 for both cohorts in one mutation
    await runCycle();

    // Poll until batch ALTER DELETE mutation completes
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const res = await ctx.ch.query({
        query: `SELECT count() AS cnt FROM cohort_members
                WHERE cohort_id IN ({a:UUID}, {b:UUID})`,
        query_params: { a: cohortA, b: cohortB },
        format: 'JSONEachRow',
      });
      const total = Number((await res.json<{ cnt: string }>())[0].cnt);
      // 2 cohorts × 1 person each = 2 rows after dedup
      if (total <= 2) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    // Verify both cohorts still have their correct members
    const membersA = await getCohortMembers(ctx.ch, projectId, cohortA);
    const membersB = await getCohortMembers(ctx.ch, projectId, cohortB);
    expect(membersA).toContain(personA);
    expect(membersB).toContain(personB);

    // Verify only 1 version per person per cohort remains (FINAL dedup)
    const result = await ctx.ch.query({
      query: `SELECT cohort_id, count() AS cnt
              FROM cohort_members FINAL
              WHERE cohort_id IN ({a:UUID}, {b:UUID})
              GROUP BY cohort_id`,
      query_params: { a: cohortA, b: cohortB },
      format: 'JSONEachRow',
    });
    const counts = await result.json<{ cohort_id: string; cnt: string }>();
    for (const row of counts) {
      expect(Number(row.cnt)).toBe(1);
    }
  });

  it('not_performed_event cohort — persons active but did NOT perform specific event', async () => {
    const projectId = testProject.projectId;
    const personActive = randomUUID(); // has page_view only
    const personPerformed = randomUUID(); // has page_view + purchase

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: `coh-np-active-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ status: 'active' }),
        timestamp: ts(1),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPerformed,
        distinct_id: `coh-np-perf-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ status: 'performed' }),
        timestamp: ts(1, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personPerformed,
        distinct_id: `coh-np-perf-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ status: 'performed' }),
        timestamp: ts(1, 11),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Not Purchased', {
      type: 'AND',
      values: [
        { type: 'not_performed_event', event_name: 'purchase', time_window_days: 30 },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personActive);
    expect(members).not.toContain(personPerformed);
  });

  it('distributed lock blocks runCycle', async () => {
    await ctx.redis.set(COHORT_LOCK_KEY, 'other-instance', 'EX', 120);

    const personId = randomUUID();
    const uniquePlan = `locked_test_${randomUUID().slice(0, 8)}`;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: testProject.projectId,
        person_id: personId,
        distinct_id: `coh-lock-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: uniquePlan }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(testProject.projectId, testProject.userId, 'Lock Test', {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: uniquePlan },
      ],
    });

    await svc.runCycle();

    const members = await getCohortMembers(ctx.ch, testProject.projectId, cohortId);
    expect(members).not.toContain(personId);

    await ctx.redis.del(COHORT_LOCK_KEY);
  });
});
