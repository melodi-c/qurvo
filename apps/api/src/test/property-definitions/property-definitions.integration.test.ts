import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq, and, desc, asc, ilike, count } from 'drizzle-orm';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  createTestProject,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { propertyDefinitions } from '@qurvo/db';
import { queryPropertyNamesWithCount } from '../../events/property-names-with-count.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── queryPropertyNamesWithCount (ClickHouse) ─────────────────────────────────

describe('queryPropertyNamesWithCount', () => {
  it('returns event and user properties with counts', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        timestamp: ts(1),
        properties: JSON.stringify({ plan: 'pro', page: '/home' }),
        user_properties: JSON.stringify({ email: 'a@b.com' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'click',
        timestamp: ts(2),
        properties: JSON.stringify({ plan: 'pro' }),
        user_properties: JSON.stringify({ email: 'a@b.com', name: 'Alice' }),
      }),
    ]);

    const result = await queryPropertyNamesWithCount(ctx.ch, { project_id: projectId });

    // Event properties: plan (2), page (1)
    const plan = result.find((r) => r.property_name === 'properties.plan');
    expect(plan).toBeDefined();
    expect(plan!.property_type).toBe('event');
    expect(plan!.count).toBe(2);

    const page = result.find((r) => r.property_name === 'properties.page');
    expect(page).toBeDefined();
    expect(page!.count).toBe(1);

    // User properties: email (2), name (1)
    const email = result.find((r) => r.property_name === 'user_properties.email');
    expect(email).toBeDefined();
    expect(email!.property_type).toBe('person');
    expect(email!.count).toBe(2);

    const name = result.find((r) => r.property_name === 'user_properties.name');
    expect(name).toBeDefined();
    expect(name!.count).toBe(1);
  });

  it('returns results ordered by count descending', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'e1',
        timestamp: ts(1),
        properties: JSON.stringify({ rare: 'x' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'e2',
        timestamp: ts(2),
        properties: JSON.stringify({ common: 'a' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'e3',
        timestamp: ts(3),
        properties: JSON.stringify({ common: 'b' }),
      }),
    ]);

    const result = await queryPropertyNamesWithCount(ctx.ch, { project_id: projectId });

    const common = result.find((r) => r.property_name === 'properties.common');
    const rare = result.find((r) => r.property_name === 'properties.rare');

    expect(common).toBeDefined();
    expect(common!.count).toBe(2);
    expect(rare).toBeDefined();
    expect(rare!.count).toBe(1);

    // Overall order should be descending by count
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
    }
  });

  it('does not return properties from other projects', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectA,
        person_id: personId,
        event_name: 'e1',
        timestamp: ts(1),
        properties: JSON.stringify({ prop_a: 'x' }),
      }),
      buildEvent({
        project_id: projectB,
        person_id: personId,
        event_name: 'e1',
        timestamp: ts(1),
        properties: JSON.stringify({ prop_b: 'y' }),
      }),
    ]);

    const resultA = await queryPropertyNamesWithCount(ctx.ch, { project_id: projectA });
    const resultB = await queryPropertyNamesWithCount(ctx.ch, { project_id: projectB });

    expect(resultA.map((r) => r.property_name)).toContain('properties.prop_a');
    expect(resultA.map((r) => r.property_name)).not.toContain('properties.prop_b');

    expect(resultB.map((r) => r.property_name)).toContain('properties.prop_b');
    expect(resultB.map((r) => r.property_name)).not.toContain('properties.prop_a');
  });

  it('returns empty array when no events exist', async () => {
    const projectId = randomUUID();
    const result = await queryPropertyNamesWithCount(ctx.ch, { project_id: projectId });
    expect(result).toEqual([]);
  });
});

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

// ── Merge logic (CH + PG) ───────────────────────────────────────────────────

describe('property definitions merge (ClickHouse + PostgreSQL)', () => {
  it('merges ClickHouse properties with PostgreSQL metadata', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'purchase',
        timestamp: ts(1),
        properties: JSON.stringify({ plan: 'pro', amount: '99' }),
      }),
    ]);

    await ctx.db.insert(propertyDefinitions).values({
      project_id: projectId,
      property_name: 'properties.plan',
      property_type: 'event',
      description: 'Subscription plan',
      tags: ['billing'],
      verified: true,
    });

    const [chRows, pgRows] = await Promise.all([
      queryPropertyNamesWithCount(ctx.ch, { project_id: projectId }),
      ctx.db
        .select()
        .from(propertyDefinitions)
        .where(eq(propertyDefinitions.project_id, projectId)),
    ]);

    const metaMap = new Map(
      pgRows.map((r) => [`${r.property_name}:${r.property_type}`, r]),
    );

    const merged = chRows.map((ch) => {
      const meta = metaMap.get(`${ch.property_name}:${ch.property_type}`);
      return {
        property_name: ch.property_name,
        property_type: ch.property_type,
        count: ch.count,
        id: meta?.id ?? null,
        description: meta?.description ?? null,
        tags: meta?.tags ?? [],
        verified: meta?.verified ?? false,
      };
    });

    const plan = merged.find((r) => r.property_name === 'properties.plan');
    expect(plan).toBeDefined();
    expect(plan!.description).toBe('Subscription plan');
    expect(plan!.tags).toEqual(['billing']);
    expect(plan!.verified).toBe(true);
    expect(plan!.id).not.toBeNull();

    const amount = merged.find((r) => r.property_name === 'properties.amount');
    expect(amount).toBeDefined();
    expect(amount!.description).toBeNull();
    expect(amount!.tags).toEqual([]);
    expect(amount!.verified).toBe(false);
    expect(amount!.id).toBeNull();
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
