import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupContainers, createTestProject, type ContainerContext } from '@qurvo/testing';
import { persons, personDistinctIds } from '@qurvo/db';
import { queryPersons, queryPersonsCount } from '../../persons/persons.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
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
