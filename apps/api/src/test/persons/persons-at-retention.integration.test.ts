import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  createTestProject,
} from '@qurvo/testing';
import { persons, personDistinctIds } from '@qurvo/db';
import { getTestContext, type ContainerContext } from '../context';
import { queryPersonsAtRetentionCell } from '../../persons/persons-at-retention-cell.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/** Insert a person row + optional distinct_ids into PostgreSQL. */
async function insertPerson(
  projectId: string,
  opts: {
    id?: string;
    properties?: Record<string, unknown>;
    distinctIds?: string[];
  } = {},
) {
  const personId = opts.id ?? randomUUID();
  const now = new Date();
  await ctx.db.insert(persons).values({
    id: personId,
    project_id: projectId,
    properties: opts.properties ?? {},
    created_at: now,
    updated_at: now,
  } as any);

  if (opts.distinctIds?.length) {
    await ctx.db.insert(personDistinctIds).values(
      opts.distinctIds.map((did) => ({
        project_id: projectId,
        person_id: personId,
        distinct_id: did,
      })) as any,
    );
  }

  return personId;
}

describe('queryPersonsAtRetentionCell', () => {
  it('returns all 3 persons at cohort_date=day-5, period_offset=0 (cohort period)', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertPerson(projectId, { id: personA, distinctIds: ['alice'] });
    await insertPerson(projectId, { id: personB, distinctIds: ['bob'] });
    await insertPerson(projectId, { id: personC, distinctIds: ['charlie'] });

    // All 3 persons do the target event on day-5
    // personA returns on day-4 (period_offset=1)
    // personB returns on day-3 (period_offset=2)
    // personC does not return
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'alice', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'bob', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'charlie', event_name: 'login', timestamp: ts(5, 12) }),
      // Returns
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'alice', event_name: 'login', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'bob', event_name: 'login', timestamp: ts(3, 12) }),
    ]);

    // period_offset=0: all 3 persons
    const result0 = await queryPersonsAtRetentionCell(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_date: daysAgo(5),
      period_offset: 0,
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });

    expect(result0.person_ids).toHaveLength(3);
    expect(result0.person_ids).toContain(personA);
    expect(result0.person_ids).toContain(personB);
    expect(result0.person_ids).toContain(personC);
    expect(result0.total).toBe(3);
  });

  it('returns only persons who returned at period_offset=1', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertPerson(projectId, { id: personA, distinctIds: ['alice'] });
    await insertPerson(projectId, { id: personB, distinctIds: ['bob'] });
    await insertPerson(projectId, { id: personC, distinctIds: ['charlie'] });

    await insertTestEvents(ctx.ch, [
      // All 3 do event on day-5
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'alice', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'bob', event_name: 'login', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'charlie', event_name: 'login', timestamp: ts(5, 12) }),
      // Only personA returns on day-4 (period_offset=1 with daily granularity)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'alice', event_name: 'login', timestamp: ts(4, 12) }),
    ]);

    const result1 = await queryPersonsAtRetentionCell(ctx.ch, {
      project_id: projectId,
      target_event: 'login',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_date: daysAgo(5),
      period_offset: 1,
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });

    expect(result1.person_ids).toHaveLength(1);
    expect(result1.person_ids).toContain(personA);
    expect(result1.total).toBe(1);
  });

  it('supports separate return_event', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const person = randomUUID();
    await insertPerson(projectId, { id: person, distinctIds: ['user'] });

    // person does 'signup' on day-5, then 'purchase' on day-4
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'user', event_name: 'signup', timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'user', event_name: 'purchase', timestamp: ts(4, 12) }),
    ]);

    const result = await queryPersonsAtRetentionCell(ctx.ch, {
      project_id: projectId,
      target_event: 'signup',
      return_event: 'purchase',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 3,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_date: daysAgo(5),
      period_offset: 1,
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });

    expect(result.person_ids).toHaveLength(1);
    expect(result.person_ids).toContain(person);
  });

  it('supports pagination via limit/offset', async () => {
    const { projectId } = await createTestProject(ctx.db);

    // Create 4 persons, all active on day-5
    const pids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const pid = randomUUID();
      await insertPerson(projectId, { id: pid });
      pids.push(pid);
    }

    await insertTestEvents(ctx.ch, pids.map((pid) =>
      buildEvent({ project_id: projectId, person_id: pid, distinct_id: pid, event_name: 'ev', timestamp: ts(5, 12) }),
    ));

    // All 4 at period_offset=0
    const all = await queryPersonsAtRetentionCell(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_date: daysAgo(5),
      period_offset: 0,
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });
    expect(all.total).toBe(4);

    // Page 1
    const page1 = await queryPersonsAtRetentionCell(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_date: daysAgo(5),
      period_offset: 0,
      timezone: 'UTC',
      limit: 2,
      offset: 0,
    });
    expect(page1.person_ids).toHaveLength(2);
    expect(page1.total).toBe(4);

    // Page 2
    const page2 = await queryPersonsAtRetentionCell(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      retention_type: 'recurring',
      granularity: 'day',
      periods: 2,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      cohort_date: daysAgo(5),
      period_offset: 0,
      timezone: 'UTC',
      limit: 2,
      offset: 2,
    });
    expect(page2.person_ids).toHaveLength(2);
    expect(page2.total).toBe(4);

    // No overlap
    const allIds = [...page1.person_ids, ...page2.person_ids];
    expect(new Set(allIds).size).toBe(4);
  });
});
