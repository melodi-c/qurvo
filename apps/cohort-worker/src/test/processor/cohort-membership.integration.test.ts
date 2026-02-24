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
import { cohorts, type CohortConditionGroup } from '@qurvo/db';
import { getTestContext } from '../context';
import { getCohortMembers } from '../helpers/ch';
import { CohortMembershipService } from '../../cohort-worker/cohort-membership.service';

let ctx: ContainerContext;
let workerApp: INestApplicationContext;
let testProject: TestProject;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  workerApp = tc.app;
  testProject = tc.testProject;
}, 120_000);

async function createCohort(
  projectId: string,
  userId: string,
  name: string,
  definition: CohortConditionGroup,
): Promise<string> {
  const cohortId = randomUUID();
  await ctx.db.insert(cohorts).values({
    id: cohortId,
    project_id: projectId,
    created_by: userId,
    name,
    definition,
  } as any);
  return cohortId;
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

    await ctx.redis.del('cohort_membership:lock');
    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

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

    await ctx.redis.del('cohort_membership:lock');
    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

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

    await ctx.redis.del('cohort_membership:lock');
    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

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

    await ctx.redis.del('cohort_membership:lock');
    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

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

    await ctx.redis.del('cohort_membership:lock');
    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

    await ctx.redis.del('cohort_membership:lock');
    await (svc as any).runCycle();

    await new Promise((r) => setTimeout(r, 2000));

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

    await ctx.redis.del('cohort_membership:lock');
    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

    // ALTER TABLE DELETE is an async mutation in ClickHouse — poll until it completes
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      members = await getCohortMembers(ctx.ch, projectId, cohortId);
      if (!members.includes(personId)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(members).not.toContain(personId);
  });

  it('distributed lock blocks runCycle', async () => {
    await ctx.redis.set('cohort_membership:lock', 'other-instance', 'EX', 120);

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

    const svc = workerApp.get(CohortMembershipService);
    await (svc as any).runCycle();

    const members = await getCohortMembers(ctx.ch, testProject.projectId, cohortId);
    expect(members).not.toContain(personId);

    await ctx.redis.del('cohort_membership:lock');
  });
});
