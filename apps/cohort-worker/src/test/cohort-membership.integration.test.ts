import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
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
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { getTestContext } from './context';
import { getCohortMembers } from './helpers/ch';
import { CohortMembershipService } from '../cohort-worker/cohort-membership.service';
import { CohortComputationService } from '../cohort-worker/cohort-computation.service';
import { COHORT_LOCK_KEY, COHORT_MAX_ERRORS, COHORT_COMPUTE_QUEUE, COHORT_GC_CYCLE_REDIS_KEY, COHORT_GC_EVERY_N_CYCLES } from '../constants';

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

  it('negated cohort-ref — person with plan=pro excluded, person without plan=pro included', async () => {
    const projectId = testProject.projectId;
    const personPro = randomUUID();
    const personOther = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personPro,
        distinct_id: `coh-neg-pro-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'pro' }),
        timestamp: ts(1),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOther,
        distinct_id: `coh-neg-other-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(1),
      }),
    ]);

    // Base cohort: persons with plan=pro
    const baseCohortId = await createCohort(projectId, testProject.userId, 'Pro Users Negation Base', {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' },
      ],
    });

    // Negated cohort: persons NOT in the base cohort (negated: true)
    const negatedCohortId = await createCohort(projectId, testProject.userId, 'Not Pro Users', {
      type: 'AND',
      values: [
        { type: 'cohort', cohort_id: baseCohortId, negated: true },
      ],
    });

    // Single cycle is sufficient: toposort puts base at level 0 and negated at level 1.
    // Level 0 computes the base cohort first, then level 1 computes the negated cohort
    // which reads cohort_members populated in level 0.
    await runCycle();

    const baseMembers = await getCohortMembers(ctx.ch, projectId, baseCohortId);
    expect(baseMembers).toContain(personPro);
    expect(baseMembers).not.toContain(personOther);

    const negatedMembers = await getCohortMembers(ctx.ch, projectId, negatedCohortId);
    // personPro is in base cohort → excluded from negated cohort
    expect(negatedMembers).not.toContain(personPro);
    // personOther is NOT in base cohort → included in negated cohort
    expect(negatedMembers).toContain(personOther);
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

  it('markComputationSuccess — stale write is rejected when newer version already stored', async () => {
    const projectId = testProject.projectId;
    const uniquePlan = `stale_version_test_${randomUUID().slice(0, 8)}`;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: `coh-stale-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: uniquePlan }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Stale Version Test', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: uniquePlan }],
    });

    const newerVersion = Date.now() + 100_000; // future timestamp — simulates newer worker
    const staleVersion = Date.now() - 100_000; // past timestamp — simulates older worker

    // Newer worker wins the PG update first
    const newOk = await computation.markComputationSuccess(cohortId, newerVersion);
    expect(newOk).toBe(true);

    // Confirm PG has the newer version
    const [rowAfterNew] = await ctx.db
      .select({ membership_version: cohorts.membership_version })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId));
    expect(rowAfterNew.membership_version).toBe(newerVersion);

    // Stale worker tries to overwrite — should be rejected
    const staleOk = await computation.markComputationSuccess(cohortId, staleVersion);
    expect(staleOk).toBe(false);

    // PG must still hold the newer version (not overwritten by stale)
    const [rowAfterStale] = await ctx.db
      .select({ membership_version: cohorts.membership_version })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId));
    expect(rowAfterStale.membership_version).toBe(newerVersion);
  });

  it('markComputationSuccess — first write (null version) succeeds', async () => {
    const projectId = testProject.projectId;
    const uniquePlan = `null_version_test_${randomUUID().slice(0, 8)}`;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: `coh-nullver-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: uniquePlan }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Null Version Test', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: uniquePlan }],
    });

    // Cohort starts with membership_version = null
    const [rowBefore] = await ctx.db
      .select({ membership_version: cohorts.membership_version })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId));
    expect(rowBefore.membership_version).toBeNull();

    // First write — should succeed even when membership_version IS NULL
    const version = Date.now();
    const ok = await computation.markComputationSuccess(cohortId, version);
    expect(ok).toBe(true);

    const [rowAfter] = await ctx.db
      .select({ membership_version: cohorts.membership_version })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId));
    expect(rowAfter.membership_version).toBe(version);
  });

  it('job IDs are unique — 100 concurrent enqueues do not collide (Bug 1)', async () => {
    const projectId = testProject.projectId;

    // Create 100 cohorts
    const cohortIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const uniquePlan = `concurrent_test_${randomUUID().slice(0, 8)}_${i}`;
      await insertTestEvents(ctx.ch, [
        buildEvent({
          project_id: projectId,
          person_id: randomUUID(),
          distinct_id: `coh-concurrent-${randomUUID()}`,
          event_name: 'page_view',
          user_properties: JSON.stringify({ concurrent_plan: uniquePlan }),
          timestamp: ts(1),
        }),
      ]);
      const id = await createCohort(projectId, testProject.userId, `Concurrent Test ${i}`, {
        type: 'AND',
        values: [{ type: 'person_property', property: 'concurrent_plan', operator: 'eq', value: uniquePlan }],
      });
      cohortIds.push(id);
    }

    // Running a single cycle enqueues all stale cohorts. With cohortId-based job IDs
    // there should be no "Job ID already exists" collision error.
    await ctx.redis.del(COHORT_LOCK_KEY);
    await expect(svc.runCycle()).resolves.toBeUndefined();
  });

  it('gc cycle counter persists across restarts — GC runs at correct cadence (Bug 2)', async () => {
    // Reset the Redis counter to a known state
    await ctx.redis.del(COHORT_GC_CYCLE_REDIS_KEY);

    const gcSpy = vi.spyOn(computation, 'gcOrphanedMemberships').mockResolvedValue(undefined);

    // Run COHORT_GC_EVERY_N_CYCLES - 1 cycles: GC should NOT be triggered yet
    for (let i = 0; i < COHORT_GC_EVERY_N_CYCLES - 1; i++) {
      await ctx.redis.del(COHORT_LOCK_KEY);
      await svc.runCycle();
    }
    expect(gcSpy).not.toHaveBeenCalled();

    // Simulate a restart: counter in Redis is still at COHORT_GC_EVERY_N_CYCLES - 1
    // (not reset to 0 as it would be with in-memory counter)
    const counterBeforeRestart = await ctx.redis.get(COHORT_GC_CYCLE_REDIS_KEY);
    expect(Number(counterBeforeRestart)).toBe(COHORT_GC_EVERY_N_CYCLES - 1);

    // One more cycle (the Nth) should trigger GC
    await ctx.redis.del(COHORT_LOCK_KEY);
    await svc.runCycle();
    expect(gcSpy).toHaveBeenCalledTimes(1);

    gcSpy.mockRestore();
    await ctx.redis.del(COHORT_GC_CYCLE_REDIS_KEY);
  });

  it('waitUntilFinished timeout — cycle completes and recordError is called', async () => {
    const projectId = testProject.projectId;
    const personId = randomUUID();
    const uniquePlan = `timeout_test_${randomUUID().slice(0, 8)}`;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: `coh-timeout-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: uniquePlan }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Timeout Test', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: uniquePlan }],
    });

    // Spy on the queue to intercept addBulk and inject a fake job that times out
    const queue = workerApp.get<Queue>(getQueueToken(COHORT_COMPUTE_QUEUE));
    const timeoutMsg = `Job wait compute timed out before finishing, no finish notification arrived after 100ms (id=fake-job-id)`;
    const addBulkSpy = vi.spyOn(queue, 'addBulk').mockResolvedValueOnce([
      {
        id: 'fake-job-id',
        name: 'compute',
        data: { cohortId, projectId, definition: {} as never },
        waitUntilFinished: () => Promise.reject(new Error(timeoutMsg)),
      } as never,
    ]);

    const recordErrorSpy = vi.spyOn(computation, 'recordError');

    await ctx.redis.del(COHORT_LOCK_KEY);
    // runCycle must complete (not hang) despite the timeout
    await expect(svc.runCycle()).resolves.toBeUndefined();

    // recordError must have been called for the timed-out cohort
    expect(recordErrorSpy).toHaveBeenCalledWith(cohortId, expect.objectContaining({ message: expect.stringContaining('timed out') }));

    addBulkSpy.mockRestore();
    recordErrorSpy.mockRestore();
  });

  it('rejected job from Promise.allSettled triggers recordError with cohort_id (Bug a)', async () => {
    const projectId = testProject.projectId;
    const personId = randomUUID();
    const uniquePlan = `rejected_test_${randomUUID().slice(0, 8)}`;

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        distinct_id: `coh-rejected-${randomUUID()}`,
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: uniquePlan }),
        timestamp: ts(1),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Rejected Test', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: uniquePlan }],
    });

    // Inject a fake job whose waitUntilFinished rejects with a non-timeout error
    // (e.g. framework-level Bull/Redis failure). The inner .catch only handles timeouts,
    // so this rejection propagates to Promise.allSettled as a rejected result.
    const queue = workerApp.get<Queue>(getQueueToken(COHORT_COMPUTE_QUEUE));
    const addBulkSpy = vi.spyOn(queue, 'addBulk').mockResolvedValueOnce([
      {
        id: 'fake-rejected-id',
        name: 'compute',
        data: { cohortId, projectId, definition: {} as never },
        waitUntilFinished: () => Promise.reject(new Error('Redis connection lost')),
      } as never,
    ]);

    const recordErrorSpy = vi.spyOn(computation, 'recordError');

    await ctx.redis.del(COHORT_LOCK_KEY);
    await expect(svc.runCycle()).resolves.toBeUndefined();

    // recordError must have been called for the rejected cohort (not silently ignored)
    expect(recordErrorSpy).toHaveBeenCalledWith(
      cohortId,
      expect.objectContaining({ message: 'Redis connection lost' }),
    );

    addBulkSpy.mockRestore();
    recordErrorSpy.mockRestore();
  });

  it('lock.extend() returning false aborts remaining levels (Bug b)', async () => {
    const projectId = testProject.projectId;

    // Create two cohorts with a dependency so they end up in different levels.
    // baseCohort → level 0, dependentCohort (ref to baseCohort) → level 1.
    const baseCohortId = await createCohort(projectId, testProject.userId, 'Lock Extend Base', {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: `lock_extend_base_${randomUUID().slice(0, 8)}` }],
    });

    const dependentCohortId = await createCohort(projectId, testProject.userId, 'Lock Extend Dependent', {
      type: 'AND',
      values: [{ type: 'cohort', cohort_id: baseCohortId, negated: false }],
    });

    // Spy on lock.extend: succeed for level 0, fail for level 1
    const lock = (svc as any).lock;
    let extendCallCount = 0;
    const extendSpy = vi.spyOn(lock, 'extend').mockImplementation(async () => {
      extendCallCount++;
      // First call (level 0) succeeds, second call (level 1) fails = lock lost
      return extendCallCount <= 1;
    });

    const computeSpy = vi.spyOn(computation, 'computeMembership');

    await ctx.redis.del(COHORT_LOCK_KEY);
    await svc.runCycle();

    // computeMembership should have been called for level 0 cohorts only.
    // Level 1 (dependentCohort) should NOT have been computed because lock was lost.
    const computedCohortIds = computeSpy.mock.calls.map((c) => c[0]);
    expect(computedCohortIds).toContain(baseCohortId);
    expect(computedCohortIds).not.toContain(dependentCohortId);

    extendSpy.mockRestore();
    computeSpy.mockRestore();
  });

  // ── Advanced condition types ──────────────────────────────────────────────

  it('first_time_event — person whose first event is within the window is included', async () => {
    const projectId = testProject.projectId;
    const newPerson = randomUUID();   // first signup 2 days ago → within 7-day window
    const oldPerson = randomUUID();   // first signup 20 days ago → outside window

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: newPerson,
        distinct_id: `coh-fte-new-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'new' }),
        timestamp: ts(2),
      }),
      buildEvent({
        project_id: projectId,
        person_id: oldPerson,
        distinct_id: `coh-fte-old-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ role: 'old' }),
        timestamp: ts(20),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'First Time Signup', {
      type: 'AND',
      values: [
        { type: 'first_time_event', event_name: 'signup', time_window_days: 7 },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(newPerson);
    expect(members).not.toContain(oldPerson);
  });

  it('event_sequence — person with correct order included, reversed order excluded', async () => {
    const projectId = testProject.projectId;
    const personCorrect = randomUUID();   // signup → purchase (correct order)
    const personReversed = randomUUID();  // purchase → signup (wrong order)

    await insertTestEvents(ctx.ch, [
      // personCorrect: signup at day 3 hour 10, purchase at day 3 hour 11 (correct order)
      buildEvent({
        project_id: projectId,
        person_id: personCorrect,
        distinct_id: `coh-seq-ok-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ seq: 'correct' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personCorrect,
        distinct_id: `coh-seq-ok-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ seq: 'correct' }),
        timestamp: ts(3, 11),
      }),
      // personReversed: purchase at day 3 hour 10, signup at day 3 hour 11 (wrong order)
      buildEvent({
        project_id: projectId,
        person_id: personReversed,
        distinct_id: `coh-seq-rev-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ seq: 'reversed' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReversed,
        distinct_id: `coh-seq-rev-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ seq: 'reversed' }),
        timestamp: ts(3, 11),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Signup Then Purchase', {
      type: 'AND',
      values: [
        {
          type: 'event_sequence',
          steps: [
            { event_name: 'signup' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personCorrect);
    expect(members).not.toContain(personReversed);
  });

  it('not_performed_event_sequence — person without sequence included, with sequence excluded', async () => {
    const projectId = testProject.projectId;
    const personNoSeq = randomUUID();    // has signup only (no purchase after) → included
    const personWithSeq = randomUUID();  // has signup → purchase → excluded

    await insertTestEvents(ctx.ch, [
      // personNoSeq: only signup, no purchase
      buildEvent({
        project_id: projectId,
        person_id: personNoSeq,
        distinct_id: `coh-nseq-no-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ nseq: 'no' }),
        timestamp: ts(3, 10),
      }),
      // personWithSeq: signup then purchase (matches sequence)
      buildEvent({
        project_id: projectId,
        person_id: personWithSeq,
        distinct_id: `coh-nseq-yes-${randomUUID()}`,
        event_name: 'signup',
        user_properties: JSON.stringify({ nseq: 'yes' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithSeq,
        distinct_id: `coh-nseq-yes-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ nseq: 'yes' }),
        timestamp: ts(3, 11),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Not Signup Then Purchase', {
      type: 'AND',
      values: [
        {
          type: 'not_performed_event_sequence',
          steps: [
            { event_name: 'signup' },
            { event_name: 'purchase' },
          ],
          time_window_days: 30,
        },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personNoSeq);
    expect(members).not.toContain(personWithSeq);
  });

  it('performed_regularly — person active in enough periods included, sparse excluded', async () => {
    const projectId = testProject.projectId;
    const personRegular = randomUUID();   // events in 4 distinct weeks → meets min_periods=3
    const personSparse = randomUUID();    // events in 1 week only → below threshold

    // personRegular: events across 4 distinct weeks within last 30 days
    // Week 1: ~3 days ago, Week 2: ~10 days ago, Week 3: ~17 days ago, Week 4: ~24 days ago
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personRegular,
        distinct_id: `coh-reg-ok-${randomUUID()}`,
        event_name: 'login',
        user_properties: JSON.stringify({ regularity: 'high' }),
        timestamp: ts(3),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personRegular,
        distinct_id: `coh-reg-ok-${randomUUID()}`,
        event_name: 'login',
        user_properties: JSON.stringify({ regularity: 'high' }),
        timestamp: ts(10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personRegular,
        distinct_id: `coh-reg-ok-${randomUUID()}`,
        event_name: 'login',
        user_properties: JSON.stringify({ regularity: 'high' }),
        timestamp: ts(17),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personRegular,
        distinct_id: `coh-reg-ok-${randomUUID()}`,
        event_name: 'login',
        user_properties: JSON.stringify({ regularity: 'high' }),
        timestamp: ts(24),
      }),
      // personSparse: only 1 event in last 30 days
      buildEvent({
        project_id: projectId,
        person_id: personSparse,
        distinct_id: `coh-reg-sparse-${randomUUID()}`,
        event_name: 'login',
        user_properties: JSON.stringify({ regularity: 'low' }),
        timestamp: ts(3),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Regular Users', {
      type: 'AND',
      values: [
        {
          type: 'performed_regularly',
          event_name: 'login',
          period_type: 'week',
          total_periods: 4,
          min_periods: 3,
          time_window_days: 30,
        },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personRegular);
    expect(members).not.toContain(personSparse);
  });

  it('stopped_performing — person active historically but not recently is included', async () => {
    const projectId = testProject.projectId;
    const personStopped = randomUUID();   // event 15 days ago (in historical), none in recent → included
    const personActive = randomUUID();    // event 2 days ago (in recent window) → excluded

    // Config: recent_window_days=7, historical_window_days=30
    // Historical window: [now-30d, now-7d)
    // Recent window: [now-7d, now]
    await insertTestEvents(ctx.ch, [
      // personStopped: event 15 days ago → in historical but not in recent
      buildEvent({
        project_id: projectId,
        person_id: personStopped,
        distinct_id: `coh-stop-yes-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ stopped: 'yes' }),
        timestamp: ts(15),
      }),
      // personActive: event 2 days ago → in recent window → NOT stopped
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: `coh-stop-no-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ stopped: 'no' }),
        timestamp: ts(15),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personActive,
        distinct_id: `coh-stop-no-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ stopped: 'no' }),
        timestamp: ts(2),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Stopped Purchasing', {
      type: 'AND',
      values: [
        {
          type: 'stopped_performing',
          event_name: 'purchase',
          recent_window_days: 7,
          historical_window_days: 30,
        },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personStopped);
    expect(members).not.toContain(personActive);
  });

  it('restarted_performing — person with historical + gap + recent activity included', async () => {
    const projectId = testProject.projectId;
    const personRestarted = randomUUID();  // events in historical & recent, none in gap → included
    const personOnlyRecent = randomUUID(); // events only in recent → excluded (no historical)

    // Config: recent_window_days=7, gap_window_days=14, historical_window_days=60
    // Validation: historical (60) > recent (7) + gap (14) = 21 ✓
    //
    // Windows (relative to now):
    //   Recent:     [now-7d, now]
    //   Gap:        [now-21d, now-7d)
    //   Historical: [now-60d, now-21d)
    await insertTestEvents(ctx.ch, [
      // personRestarted: historical event (40 days ago) — in [now-60d, now-21d)
      buildEvent({
        project_id: projectId,
        person_id: personRestarted,
        distinct_id: `coh-restart-yes-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ restarted: 'yes' }),
        timestamp: ts(40),
      }),
      // personRestarted: recent event (3 days ago) — in [now-7d, now]
      buildEvent({
        project_id: projectId,
        person_id: personRestarted,
        distinct_id: `coh-restart-yes-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ restarted: 'yes' }),
        timestamp: ts(3),
      }),
      // personOnlyRecent: only recent event (3 days ago), no historical
      buildEvent({
        project_id: projectId,
        person_id: personOnlyRecent,
        distinct_id: `coh-restart-no-${randomUUID()}`,
        event_name: 'purchase',
        user_properties: JSON.stringify({ restarted: 'no' }),
        timestamp: ts(3),
      }),
    ]);

    const cohortId = await createCohort(projectId, testProject.userId, 'Restarted Purchasing', {
      type: 'AND',
      values: [
        {
          type: 'restarted_performing',
          event_name: 'purchase',
          recent_window_days: 7,
          gap_window_days: 14,
          historical_window_days: 60,
        },
      ],
    });

    await runCycle();

    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personRestarted);
    expect(members).not.toContain(personOnlyRecent);
  });

  it('gcOrphanedMemberships with 0 dynamic cohorts does not delete all rows (Bug c)', async () => {
    const projectId = testProject.projectId;
    const personId = randomUUID();
    const cohortId = randomUUID();

    // Insert a row into cohort_members directly (simulating freshly computed membership)
    await ctx.ch.insert({
      table: 'cohort_members',
      values: [
        {
          cohort_id: cohortId,
          project_id: projectId,
          person_id: personId,
          version: Date.now(),
        },
      ],
      format: 'JSONEachRow',
      clickhouse_settings: { async_insert: 0 },
    });

    // Delete ALL dynamic cohorts from PG so allDynamicIds = []
    await ctx.db.delete(cohorts).where(eq(cohorts.is_static, false));

    // Call GC — with the fix, it should skip (not delete all rows)
    await computation.gcOrphanedMemberships();

    // The row should still be in cohort_members (not deleted)
    const members = await getCohortMembers(ctx.ch, projectId, cohortId);
    expect(members).toContain(personId);

    // Restore: re-create a dummy dynamic cohort so subsequent tests don't break
    await ctx.db.insert(cohorts).values({
      project_id: projectId,
      created_by: testProject.userId,
      name: 'Dummy Restore',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'dummy' }] },
    });
  });
});
