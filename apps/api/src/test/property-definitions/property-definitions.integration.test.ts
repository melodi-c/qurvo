import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and, ilike, count } from 'drizzle-orm';
import { createTestProject } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { propertyDefinitions } from '@qurvo/db';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── property_definitions upsert (PostgreSQL) ─────────────────────────────────

describe('property_definitions upsert', () => {
  it('inserts a new property definition', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const rows = await ctx.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: 'properties.plan',
        property_type: 'event',
        description: 'User subscription plan',
        tags: ['billing', 'core'],
        verified: true,
      })
      .returning();

    expect(rows).toHaveLength(1);
    expect(rows[0].property_name).toBe('properties.plan');
    expect(rows[0].property_type).toBe('event');
    expect(rows[0].description).toBe('User subscription plan');
    expect(rows[0].tags).toEqual(['billing', 'core']);
    expect(rows[0].verified).toBe(true);
  });

  it('updates on conflict (same project_id + property_name + property_type)', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: 'properties.amount',
        property_type: 'event',
        description: 'Initial',
        tags: [],
        verified: false,
      });

    const rows = await ctx.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: 'properties.amount',
        property_type: 'event',
        description: 'Updated',
        tags: ['revenue'],
        verified: true,
      })
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
        set: {
          description: 'Updated',
          tags: ['revenue'],
          verified: true,
          updated_at: new Date(),
        },
      })
      .returning();

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Updated');
    expect(rows[0].tags).toEqual(['revenue']);
    expect(rows[0].verified).toBe(true);

    const allRows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(
        and(
          eq(propertyDefinitions.project_id, projectId),
          eq(propertyDefinitions.property_name, 'properties.amount'),
        ),
      );
    expect(allRows).toHaveLength(1);
  });

  it('allows same property_name with different types', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values({
      project_id: projectId,
      property_name: 'properties.email',
      property_type: 'event',
      description: 'Email from event',
      tags: [],
      verified: false,
    });

    await ctx.db.insert(propertyDefinitions).values({
      project_id: projectId,
      property_name: 'user_properties.email',
      property_type: 'person',
      description: 'Email from person',
      tags: [],
      verified: false,
    });

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    expect(rows).toHaveLength(2);
  });

  it('cascades on project deletion', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values({
      project_id: projectId,
      property_name: 'properties.test',
      property_type: 'event',
      tags: [],
      verified: false,
    });

    const { projects } = await import('@qurvo/db');
    await ctx.db.delete(projects).where(eq(projects.id, projectId));

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));
    expect(rows).toHaveLength(0);
  });
});

// ── Pagination ───────────────────────────────────────────────────────────────

describe('property_definitions pagination', () => {
  it('returns paginated results with total', async () => {
    const { projectId } = await createTestProject(ctx.db);

    for (let i = 0; i < 5; i++) {
      await ctx.db.insert(propertyDefinitions).values({
        project_id: projectId,
        property_name: `properties.prop_${i}`,
        property_type: 'event',
        tags: [],
        verified: false,
      });
    }

    const where = eq(propertyDefinitions.project_id, projectId);

    const [rows, countResult] = await Promise.all([
      ctx.db.select().from(propertyDefinitions).where(where).limit(2).offset(0),
      ctx.db.select({ count: count() }).from(propertyDefinitions).where(where),
    ]);

    expect(rows).toHaveLength(2);
    expect(countResult[0].count).toBe(5);
  });
});

// ── Search ───────────────────────────────────────────────────────────────────

describe('property_definitions search', () => {
  it('filters by property_name ILIKE', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values([
      { project_id: projectId, property_name: 'properties.email', property_type: 'event', tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.plan', property_type: 'event', tags: [], verified: false },
      { project_id: projectId, property_name: 'user_properties.email', property_type: 'person', tags: [], verified: false },
    ]);

    const where = and(
      eq(propertyDefinitions.project_id, projectId),
      ilike(propertyDefinitions.property_name, '%email%'),
    );

    const rows = await ctx.db.select().from(propertyDefinitions).where(where);
    expect(rows).toHaveLength(2);
  });

  it('combines type filter with search', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values([
      { project_id: projectId, property_name: 'properties.email', property_type: 'event', tags: [], verified: false },
      { project_id: projectId, property_name: 'user_properties.email', property_type: 'person', tags: [], verified: false },
    ]);

    const where = and(
      eq(propertyDefinitions.project_id, projectId),
      eq(propertyDefinitions.property_type, 'event'),
      ilike(propertyDefinitions.property_name, '%email%'),
    );

    const rows = await ctx.db.select().from(propertyDefinitions).where(where);
    expect(rows).toHaveLength(1);
    expect(rows[0].property_type).toBe('event');
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe('property_definitions delete', () => {
  it('deletes by (project_id, property_name, property_type)', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values({
      project_id: projectId,
      property_name: 'properties.to_delete',
      property_type: 'event',
      tags: [],
      verified: false,
    });

    await ctx.db
      .delete(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.to_delete'),
        eq(propertyDefinitions.property_type, 'event'),
      ));

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    expect(rows).toHaveLength(0);
  });

  it('does not delete property with same name but different type', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values([
      { project_id: projectId, property_name: 'properties.email', property_type: 'event', tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.email', property_type: 'person', tags: [], verified: false },
    ]);

    await ctx.db
      .delete(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.email'),
        eq(propertyDefinitions.property_type, 'event'),
      ));

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    expect(rows).toHaveLength(1);
    expect(rows[0].property_type).toBe('person');
  });
});

// ── value_type edit ──────────────────────────────────────────────────────────

describe('property_definitions value_type edit', () => {
  it('inserts with value_type and is_numerical', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const rows = await ctx.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: 'properties.amount',
        property_type: 'event',
        value_type: 'Numeric',
        is_numerical: true,
        tags: [],
        verified: false,
      })
      .returning();

    expect(rows[0].value_type).toBe('Numeric');
    expect(rows[0].is_numerical).toBe(true);
  });

  it('updates value_type via conflict update', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values({
      project_id: projectId,
      property_name: 'properties.amount',
      property_type: 'event',
      value_type: 'String',
      is_numerical: false,
      tags: [],
      verified: false,
    });

    const rows = await ctx.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: 'properties.amount',
        property_type: 'event',
        value_type: 'Numeric',
        is_numerical: true,
        tags: [],
        verified: false,
      })
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
        set: {
          value_type: 'Numeric',
          is_numerical: true,
          updated_at: new Date(),
        },
      })
      .returning();

    expect(rows[0].value_type).toBe('Numeric');
    expect(rows[0].is_numerical).toBe(true);

    const allRows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.amount'),
      ));
    expect(allRows).toHaveLength(1);
  });
});

// ── is_numerical filter ──────────────────────────────────────────────────────

describe('property_definitions is_numerical filter', () => {
  it('filters only numerical properties', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values([
      { project_id: projectId, property_name: 'properties.amount', property_type: 'event', is_numerical: true, tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.price', property_type: 'event', is_numerical: true, tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.name', property_type: 'event', is_numerical: false, tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.email', property_type: 'person', is_numerical: false, tags: [], verified: false },
    ]);

    const where = and(
      eq(propertyDefinitions.project_id, projectId),
      eq(propertyDefinitions.is_numerical, true),
    );

    const rows = await ctx.db.select().from(propertyDefinitions).where(where);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.is_numerical)).toBe(true);
  });

  it('filters non-numerical properties', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values([
      { project_id: projectId, property_name: 'properties.amount', property_type: 'event', is_numerical: true, tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.name', property_type: 'event', is_numerical: false, tags: [], verified: false },
    ]);

    const where = and(
      eq(propertyDefinitions.project_id, projectId),
      eq(propertyDefinitions.is_numerical, false),
    );

    const rows = await ctx.db.select().from(propertyDefinitions).where(where);
    expect(rows).toHaveLength(1);
    expect(rows[0].property_name).toBe('properties.name');
  });

  it('combines is_numerical with type filter', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(propertyDefinitions).values([
      { project_id: projectId, property_name: 'properties.amount', property_type: 'event', is_numerical: true, tags: [], verified: false },
      { project_id: projectId, property_name: 'user_properties.age', property_type: 'person', is_numerical: true, tags: [], verified: false },
      { project_id: projectId, property_name: 'properties.name', property_type: 'event', is_numerical: false, tags: [], verified: false },
    ]);

    const where = and(
      eq(propertyDefinitions.project_id, projectId),
      eq(propertyDefinitions.property_type, 'event'),
      eq(propertyDefinitions.is_numerical, true),
    );

    const rows = await ctx.db.select().from(propertyDefinitions).where(where);
    expect(rows).toHaveLength(1);
    expect(rows[0].property_name).toBe('properties.amount');
  });
});
