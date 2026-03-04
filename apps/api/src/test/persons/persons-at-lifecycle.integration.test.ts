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
import { queryPersonsAtLifecycleBucket } from '../../persons/persons-at-lifecycle-bucket.query';

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

describe('queryPersonsAtLifecycleBucket', () => {
  it('returns correct persons for each lifecycle status in a given bucket', async () => {
    const { projectId } = await createTestProject(ctx.db);

    // Create 4 persons with different lifecycle patterns
    const personNew = randomUUID();
    const personReturning = randomUUID();
    const personResurrecting = randomUUID();
    const personDormant = randomUUID();

    // Insert persons into PostgreSQL
    await insertPerson(projectId, { id: personNew, distinctIds: ['new-user'] });
    await insertPerson(projectId, { id: personReturning, distinctIds: ['returning-user'] });
    await insertPerson(projectId, { id: personResurrecting, distinctIds: ['resurrecting-user'] });
    await insertPerson(projectId, { id: personDormant, distinctIds: ['dormant-user'] });

    // Event timeline:
    // day-6: personResurrecting (first appearance, establishes prior history)
    // day-4: personNew, personReturning, personDormant (day-4 is their first appearance)
    // day-3: personReturning (returning — active in preceding period day-4)
    //        personResurrecting (resurrecting — was active day-6 but not day-4)
    //        personDormant is NOT active day-3 → dormant on day-3
    // personNew is NOT active day-3 → dormant on day-3
    await insertTestEvents(ctx.ch, [
      // personResurrecting has prior history at day-6
      buildEvent({ project_id: projectId, person_id: personResurrecting, distinct_id: 'resurrecting-user', event_name: 'action', timestamp: ts(6, 12) }),
      // day-4: personNew, personReturning, personDormant all appear
      buildEvent({ project_id: projectId, person_id: personNew, distinct_id: 'new-user', event_name: 'action', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personReturning, distinct_id: 'returning-user', event_name: 'action', timestamp: ts(4, 12) }),
      buildEvent({ project_id: projectId, person_id: personDormant, distinct_id: 'dormant-user', event_name: 'action', timestamp: ts(4, 12) }),
      // day-3: personReturning continues, personResurrecting returns after gap
      buildEvent({ project_id: projectId, person_id: personReturning, distinct_id: 'returning-user', event_name: 'action', timestamp: ts(3, 12) }),
      buildEvent({ project_id: projectId, person_id: personResurrecting, distinct_id: 'resurrecting-user', event_name: 'action', timestamp: ts(3, 12) }),
    ]);

    const baseParams = {
      project_id: projectId,
      target_event: 'action',
      granularity: 'day' as const,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    };

    // Test: 'new' status on day-4
    const newResult = await queryPersonsAtLifecycleBucket(ctx.ch, {
      ...baseParams,
      bucket: daysAgo(4),
      status: 'new',
    });
    // personNew and personReturning and personDormant are all new on day-4
    // personResurrecting has prior history at day-6, so NOT new on day-4
    expect(newResult.person_ids).toHaveLength(3);
    expect(newResult.person_ids).toContain(personNew);
    expect(newResult.person_ids).toContain(personReturning);
    expect(newResult.person_ids).toContain(personDormant);
    expect(newResult.total).toBe(3);

    // Test: 'returning' status on day-3
    const returningResult = await queryPersonsAtLifecycleBucket(ctx.ch, {
      ...baseParams,
      bucket: daysAgo(3),
      status: 'returning',
    });
    expect(returningResult.person_ids).toContain(personReturning);
    expect(returningResult.total).toBe(1);

    // Test: 'resurrecting' status on day-3
    const resurrectingResult = await queryPersonsAtLifecycleBucket(ctx.ch, {
      ...baseParams,
      bucket: daysAgo(3),
      status: 'resurrecting',
    });
    expect(resurrectingResult.person_ids).toContain(personResurrecting);
    expect(resurrectingResult.total).toBe(1);

    // Test: 'dormant' status on day-3
    // personNew and personDormant were active on day-4 but not day-3 → dormant on day-3
    const dormantResult = await queryPersonsAtLifecycleBucket(ctx.ch, {
      ...baseParams,
      bucket: daysAgo(3),
      status: 'dormant',
    });
    expect(dormantResult.person_ids).toHaveLength(2);
    expect(dormantResult.person_ids).toContain(personNew);
    expect(dormantResult.person_ids).toContain(personDormant);
    expect(dormantResult.total).toBe(2);
  });

  // Also test 'resurrecting' on day-4 for personResurrecting
  it('classifies resurrecting correctly when prior history exists', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const person = randomUUID();
    await insertPerson(projectId, { id: person, distinctIds: ['resurr'] });

    // Active on day-8, then gap, then active on day-3
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'resurr', event_name: 'visit', timestamp: ts(8, 12) }),
      buildEvent({ project_id: projectId, person_id: person, distinct_id: 'resurr', event_name: 'visit', timestamp: ts(3, 12) }),
    ]);

    const result = await queryPersonsAtLifecycleBucket(ctx.ch, {
      project_id: projectId,
      target_event: 'visit',
      granularity: 'day',
      date_from: daysAgo(6),
      date_to: daysAgo(2),
      bucket: daysAgo(3),
      status: 'resurrecting',
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });

    expect(result.person_ids).toContain(person);
    expect(result.total).toBe(1);
  });

  it('supports pagination via limit/offset', async () => {
    const { projectId } = await createTestProject(ctx.db);

    // Create 3 new persons on day-3
    const personIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const pid = randomUUID();
      await insertPerson(projectId, { id: pid });
      personIds.push(pid);
    }

    await insertTestEvents(ctx.ch, personIds.map((pid) =>
      buildEvent({ project_id: projectId, person_id: pid, distinct_id: pid, event_name: 'ev', timestamp: ts(3, 12) }),
    ));

    // Get all
    const all = await queryPersonsAtLifecycleBucket(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      bucket: daysAgo(3),
      status: 'new',
      timezone: 'UTC',
      limit: 50,
      offset: 0,
    });
    expect(all.total).toBe(3);

    // Paginate
    const page1 = await queryPersonsAtLifecycleBucket(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      bucket: daysAgo(3),
      status: 'new',
      timezone: 'UTC',
      limit: 2,
      offset: 0,
    });
    expect(page1.person_ids).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = await queryPersonsAtLifecycleBucket(ctx.ch, {
      project_id: projectId,
      target_event: 'ev',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(2),
      bucket: daysAgo(3),
      status: 'new',
      timezone: 'UTC',
      limit: 2,
      offset: 2,
    });
    expect(page2.person_ids).toHaveLength(1);
  });
});
