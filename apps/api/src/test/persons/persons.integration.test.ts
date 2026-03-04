import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { persons, personDistinctIds, cohorts } from '@qurvo/db';
import { queryPersons, queryPersonsCount } from '../../persons/persons.query';
import { queryPersonsByIds } from '../../persons/persons-bulk.query';
import { queryPersonCohorts } from '../../persons/person-cohorts.query';
import { insertStaticCohortMembers } from '../cohorts/helpers';

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
    createdAt?: Date;
    updatedAt?: Date;
  } = {},
) {
  const personId = opts.id ?? randomUUID();
  const now = new Date();
  await ctx.db.insert(persons).values({
    id: personId,
    project_id: projectId,
    properties: opts.properties ?? {},
    created_at: opts.createdAt ?? now,
    updated_at: opts.updatedAt ?? now,
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

describe('queryPersons', () => {
  it('returns persons with their distinct_ids', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const p1 = await insertPerson(projectId, { distinctIds: ['user-a@test.com', 'anon-1'] });
    const p2 = await insertPerson(projectId, { distinctIds: ['user-b@test.com'] });
    const p3 = await insertPerson(projectId, { distinctIds: [] });

    const rows = await queryPersons(ctx.db, { project_id: projectId, limit: 50, offset: 0 });

    expect(rows).toHaveLength(3);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(p1);
    expect(ids).toContain(p2);
    expect(ids).toContain(p3);

    const row1 = rows.find((r) => r.id === p1)!;
    expect(row1.distinct_ids).toHaveLength(2);
    expect(row1.distinct_ids).toContain('user-a@test.com');
    expect(row1.distinct_ids).toContain('anon-1');

    const row3 = rows.find((r) => r.id === p3)!;
    expect(row3.distinct_ids).toHaveLength(0);
  });

  it('paginates with limit and offset', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const base = Date.now();

    for (let i = 0; i < 5; i++) {
      await insertPerson(projectId, {
        updatedAt: new Date(base - i * 1000),
        distinctIds: [`user-${i}@test.com`],
      });
    }

    const page1 = await queryPersons(ctx.db, { project_id: projectId, limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = await queryPersons(ctx.db, { project_id: projectId, limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);

    const page3 = await queryPersons(ctx.db, { project_id: projectId, limit: 2, offset: 4 });
    expect(page3).toHaveLength(1);

    // No overlap between pages
    const allIds = [...page1, ...page2, ...page3].map((r) => r.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it('sorts by updated_at DESC', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const now = Date.now();

    const oldest = await insertPerson(projectId, { updatedAt: new Date(now - 3000) });
    const middle = await insertPerson(projectId, { updatedAt: new Date(now - 2000) });
    const newest = await insertPerson(projectId, { updatedAt: new Date(now - 1000) });

    const rows = await queryPersons(ctx.db, { project_id: projectId, limit: 50, offset: 0 });

    expect(rows.map((r) => r.id)).toEqual([newest, middle, oldest]);
  });

  it('filters by search on distinct_id', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await insertPerson(projectId, { distinctIds: ['user@example.com'] });
    await insertPerson(projectId, { distinctIds: ['admin@other.org'] });
    await insertPerson(projectId, { distinctIds: ['anon-123'] });

    const rows = await queryPersons(ctx.db, {
      project_id: projectId,
      search: 'example',
      limit: 50,
      offset: 0,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].distinct_ids).toContain('user@example.com');
  });

  it('filters by property eq', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await insertPerson(projectId, { properties: { plan: 'pro' } });
    await insertPerson(projectId, { properties: { plan: 'free' } });
    await insertPerson(projectId, { properties: {} });

    const rows = await queryPersons(ctx.db, {
      project_id: projectId,
      filters: [{ property: 'plan', operator: 'eq', value: 'pro' }],
      limit: 50,
      offset: 0,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].properties).toEqual({ plan: 'pro' });
  });

  it('filters by property is_set / is_not_set', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await insertPerson(projectId, { properties: { email: 'a@b.com' } });
    await insertPerson(projectId, { properties: { name: 'Test' } });
    await insertPerson(projectId, { properties: {} });

    const isSetRows = await queryPersons(ctx.db, {
      project_id: projectId,
      filters: [{ property: 'email', operator: 'is_set' }],
      limit: 50,
      offset: 0,
    });
    expect(isSetRows).toHaveLength(1);
    expect(isSetRows[0].properties).toHaveProperty('email');

    const isNotSetRows = await queryPersons(ctx.db, {
      project_id: projectId,
      filters: [{ property: 'email', operator: 'is_not_set' }],
      limit: 50,
      offset: 0,
    });
    expect(isNotSetRows).toHaveLength(2);
  });
});

describe('queryPersonsCount', () => {
  it('returns correct count without filters', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await insertPerson(projectId);
    await insertPerson(projectId);
    await insertPerson(projectId);

    const count = await queryPersonsCount(ctx.db, { project_id: projectId });
    expect(count).toBe(3);
  });

  it('returns correct count with search', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await insertPerson(projectId, { distinctIds: ['matched@search.com'] });
    await insertPerson(projectId, { distinctIds: ['other@nope.com'] });

    const count = await queryPersonsCount(ctx.db, { project_id: projectId, search: 'search' });
    expect(count).toBe(1);
  });
});

describe('project isolation', () => {
  it('does not return persons from another project', async () => {
    const { projectId: projectA } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    await insertPerson(projectA, { distinctIds: ['shared-name'] });
    await insertPerson(projectB, { distinctIds: ['shared-name'] });

    const rowsA = await queryPersons(ctx.db, { project_id: projectA, limit: 50, offset: 0 });
    const rowsB = await queryPersons(ctx.db, { project_id: projectB, limit: 50, offset: 0 });

    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0].id).not.toBe(rowsB[0].id);

    const countA = await queryPersonsCount(ctx.db, { project_id: projectA });
    const countB = await queryPersonsCount(ctx.db, { project_id: projectB });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});

describe('queryPersonsByIds', () => {
  it('returns persons matching the given IDs with distinct_ids', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const p1 = await insertPerson(projectId, { distinctIds: ['alice@test.com'] });
    const p2 = await insertPerson(projectId, { distinctIds: ['bob@test.com'] });
    await insertPerson(projectId, { distinctIds: ['charlie@test.com'] });

    const rows = await queryPersonsByIds(ctx.db, projectId, [p1, p2]);

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(p1);
    expect(ids).toContain(p2);

    const row1 = rows.find((r) => r.id === p1)!;
    expect(row1.distinct_ids).toContain('alice@test.com');
    expect(row1.project_id).toBe(projectId);
  });

  it('returns empty array for empty input', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const rows = await queryPersonsByIds(ctx.db, projectId, []);
    expect(rows).toHaveLength(0);
  });

  it('skips IDs that do not exist', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const p1 = await insertPerson(projectId, { distinctIds: ['a@test.com'] });

    const rows = await queryPersonsByIds(ctx.db, projectId, [p1, randomUUID()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(p1);
  });

  it('deduplicates input IDs', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const p1 = await insertPerson(projectId, { distinctIds: ['dup@test.com'] });

    const rows = await queryPersonsByIds(ctx.db, projectId, [p1, p1, p1]);
    expect(rows).toHaveLength(1);
  });

  it('does not return persons from another project', async () => {
    const { projectId: projectA } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    const pA = await insertPerson(projectA, { distinctIds: ['a@test.com'] });
    await insertPerson(projectB, { distinctIds: ['b@test.com'] });

    const rows = await queryPersonsByIds(ctx.db, projectB, [pA]);
    expect(rows).toHaveLength(0);
  });
});

describe('queryPersonCohorts', () => {
  /** Helper to create a cohort in PostgreSQL. */
  async function createCohort(
    projectId: string,
    userId: string,
    opts: { name: string; is_static?: boolean },
  ): Promise<string> {
    const rows = await ctx.db
      .insert(cohorts)
      .values({
        project_id: projectId,
        created_by: userId,
        name: opts.name,
        definition: { type: 'AND', values: [] },
        is_static: opts.is_static ?? false,
      })
      .returning({ id: cohorts.id });
    return rows[0].id;
  }

  /** Helper to insert dynamic cohort members into ClickHouse. */
  async function insertDynamicCohortMembers(
    projectId: string,
    cohortId: string,
    personIds: string[],
  ) {
    if (personIds.length === 0) {return;}
    const version = Date.now();
    await ctx.ch.insert({
      table: 'cohort_members',
      values: personIds.map((pid) => ({
        project_id: projectId,
        cohort_id: cohortId,
        person_id: pid,
        version,
      })),
      format: 'JSONEachRow',
      clickhouse_settings: { async_insert: 0 },
    });
  }

  it('returns both dynamic and static cohorts for a person', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personId = await insertPerson(projectId);

    const dynamicCohortId = await createCohort(projectId, userId, { name: 'Active Users' });
    const staticCohortId = await createCohort(projectId, userId, { name: 'VIP List', is_static: true });

    await insertDynamicCohortMembers(projectId, dynamicCohortId, [personId]);
    await insertStaticCohortMembers(ctx.ch, projectId, staticCohortId, [personId]);

    const result = await queryPersonCohorts(ctx.ch, ctx.db, projectId, personId);

    expect(result).toHaveLength(2);

    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(['Active Users', 'VIP List']);

    const dynamic = result.find((r) => r.name === 'Active Users')!;
    expect(dynamic.is_static).toBe(false);

    const staticRow = result.find((r) => r.name === 'VIP List')!;
    expect(staticRow.is_static).toBe(true);
  });

  it('returns empty array when person has no cohort memberships', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = await insertPerson(projectId);

    const result = await queryPersonCohorts(ctx.ch, ctx.db, projectId, personId);
    expect(result).toHaveLength(0);
  });

  it('only returns cohorts the specific person belongs to', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = await insertPerson(projectId);
    const personB = await insertPerson(projectId);

    const cohortId = await createCohort(projectId, userId, { name: 'Only B' });
    await insertDynamicCohortMembers(projectId, cohortId, [personB]);

    const resultA = await queryPersonCohorts(ctx.ch, ctx.db, projectId, personA);
    expect(resultA).toHaveLength(0);

    const resultB = await queryPersonCohorts(ctx.ch, ctx.db, projectId, personB);
    expect(resultB).toHaveLength(1);
    expect(resultB[0].name).toBe('Only B');
  });
});
