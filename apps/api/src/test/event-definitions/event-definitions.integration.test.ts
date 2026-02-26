import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and, desc, asc, ilike, count } from 'drizzle-orm';
import { createTestProject } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { eventDefinitions, eventProperties } from '@qurvo/db';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── event_definitions upsert (PostgreSQL) ────────────────────────────────────

describe('event_definitions upsert', () => {
  it('inserts a new event definition', async () => {
    const { projectId } = await createTestProject(ctx.db);

    const rows = await ctx.db
      .insert(eventDefinitions)
      .values({
        project_id: projectId,
        event_name: 'signup',
        description: 'User signs up',
        tags: ['onboarding', 'activation'],
        verified: true,
      })
      .returning();

    expect(rows).toHaveLength(1);
    expect(rows[0].event_name).toBe('signup');
    expect(rows[0].description).toBe('User signs up');
    expect(rows[0].tags).toEqual(['onboarding', 'activation']);
    expect(rows[0].verified).toBe(true);
    expect(rows[0].project_id).toBe(projectId);
  });

  it('updates on conflict (same project_id + event_name)', async () => {
    const { projectId } = await createTestProject(ctx.db);

    // First insert
    await ctx.db
      .insert(eventDefinitions)
      .values({
        project_id: projectId,
        event_name: 'purchase',
        description: 'Initial description',
        tags: [],
        verified: false,
      });

    // Upsert with conflict
    const rows = await ctx.db
      .insert(eventDefinitions)
      .values({
        project_id: projectId,
        event_name: 'purchase',
        description: 'Updated description',
        tags: ['revenue'],
        verified: true,
      })
      .onConflictDoUpdate({
        target: [eventDefinitions.project_id, eventDefinitions.event_name],
        set: {
          description: 'Updated description',
          tags: ['revenue'],
          verified: true,
          updated_at: new Date(),
        },
      })
      .returning();

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Updated description');
    expect(rows[0].tags).toEqual(['revenue']);
    expect(rows[0].verified).toBe(true);

    // Verify only one row exists
    const allRows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(
        and(
          eq(eventDefinitions.project_id, projectId),
          eq(eventDefinitions.event_name, 'purchase'),
        ),
      );

    expect(allRows).toHaveLength(1);
  });

  it('allows same event_name in different projects', async () => {
    const { projectId: projectA } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectA,
      event_name: 'login',
      description: 'Project A login',
      tags: [],
      verified: false,
    });

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectB,
      event_name: 'login',
      description: 'Project B login',
      tags: [],
      verified: false,
    });

    const rowsA = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectA));
    const rowsB = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectB));

    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].description).toBe('Project A login');
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].description).toBe('Project B login');
  });

  it('cascades on project deletion', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'test_event',
      tags: [],
      verified: false,
    });

    // Delete project
    const { projects } = await import('@qurvo/db');
    await ctx.db.delete(projects).where(eq(projects.id, projectId));

    // Event definition should be cascaded
    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    expect(rows).toHaveLength(0);
  });
});

// ── Pagination ───────────────────────────────────────────────────────────────

describe('event_definitions pagination', () => {
  it('returns paginated results with total', async () => {
    const { projectId } = await createTestProject(ctx.db);

    for (let i = 0; i < 5; i++) {
      await ctx.db.insert(eventDefinitions).values({
        project_id: projectId,
        event_name: `event_${i}`,
        tags: [],
        verified: false,
      });
    }

    const where = eq(eventDefinitions.project_id, projectId);

    const [rows, countResult] = await Promise.all([
      ctx.db.select().from(eventDefinitions).where(where).limit(2).offset(0),
      ctx.db.select({ count: count() }).from(eventDefinitions).where(where),
    ]);

    expect(rows).toHaveLength(2);
    expect(countResult[0].count).toBe(5);
  });

  it('returns remaining items with offset near end', async () => {
    const { projectId } = await createTestProject(ctx.db);

    for (let i = 0; i < 5; i++) {
      await ctx.db.insert(eventDefinitions).values({
        project_id: projectId,
        event_name: `event_${i}`,
        tags: [],
        verified: false,
      });
    }

    const where = eq(eventDefinitions.project_id, projectId);

    const rows = await ctx.db.select().from(eventDefinitions).where(where).limit(10).offset(3);
    expect(rows).toHaveLength(2);
  });

  it('returns all items when limit exceeds total', async () => {
    const { projectId } = await createTestProject(ctx.db);

    for (let i = 0; i < 3; i++) {
      await ctx.db.insert(eventDefinitions).values({
        project_id: projectId,
        event_name: `event_${i}`,
        tags: [],
        verified: false,
      });
    }

    const where = eq(eventDefinitions.project_id, projectId);
    const rows = await ctx.db.select().from(eventDefinitions).where(where).limit(100).offset(0);
    expect(rows).toHaveLength(3);
  });
});

// ── Search ───────────────────────────────────────────────────────────────────

describe('event_definitions search', () => {
  it('filters by event_name ILIKE', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values([
      { project_id: projectId, event_name: 'page_view', tags: [], verified: false },
      { project_id: projectId, event_name: 'page_scroll', tags: [], verified: false },
      { project_id: projectId, event_name: 'click', tags: [], verified: false },
    ]);

    const where = and(
      eq(eventDefinitions.project_id, projectId),
      ilike(eventDefinitions.event_name, '%page%'),
    );

    const rows = await ctx.db.select().from(eventDefinitions).where(where);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.event_name).sort()).toEqual(['page_scroll', 'page_view']);
  });

  it('search is case-insensitive', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'PageView',
      tags: [],
      verified: false,
    });

    const where = and(
      eq(eventDefinitions.project_id, projectId),
      ilike(eventDefinitions.event_name, '%page%'),
    );

    const rows = await ctx.db.select().from(eventDefinitions).where(where);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_name).toBe('PageView');
  });
});

// ── Ordering ─────────────────────────────────────────────────────────────────

describe('event_definitions ordering', () => {
  it('orders by event_name ascending', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values([
      { project_id: projectId, event_name: 'b_event', tags: [], verified: false },
      { project_id: projectId, event_name: 'a_event', tags: [], verified: false },
      { project_id: projectId, event_name: 'c_event', tags: [], verified: false },
    ]);

    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId))
      .orderBy(asc(eventDefinitions.event_name));

    expect(rows.map((r) => r.event_name)).toEqual(['a_event', 'b_event', 'c_event']);
  });

  it('orders by event_name descending', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values([
      { project_id: projectId, event_name: 'b_event', tags: [], verified: false },
      { project_id: projectId, event_name: 'a_event', tags: [], verified: false },
      { project_id: projectId, event_name: 'c_event', tags: [], verified: false },
    ]);

    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId))
      .orderBy(desc(eventDefinitions.event_name));

    expect(rows.map((r) => r.event_name)).toEqual(['c_event', 'b_event', 'a_event']);
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe('event_definitions delete', () => {
  it('deletes an event definition', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'to_delete',
      tags: [],
      verified: false,
    });

    await ctx.db
      .delete(eventDefinitions)
      .where(and(
        eq(eventDefinitions.project_id, projectId),
        eq(eventDefinitions.event_name, 'to_delete'),
      ));

    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    expect(rows).toHaveLength(0);
  });

  it('cascades delete to event_properties', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'with_props',
      tags: [],
      verified: false,
    });

    await ctx.db.insert(eventProperties).values({
      project_id: projectId,
      event_name: 'with_props',
      property_name: 'properties.plan',
      property_type: 'event',
    });

    // Delete event_properties first, then event_definition (mirrors service logic)
    await ctx.db
      .delete(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'with_props'),
      ));
    await ctx.db
      .delete(eventDefinitions)
      .where(and(
        eq(eventDefinitions.project_id, projectId),
        eq(eventDefinitions.event_name, 'with_props'),
      ));

    const epRows = await ctx.db
      .select()
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'with_props'),
      ));

    const edRows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    expect(epRows).toHaveLength(0);
    expect(edRows).toHaveLength(0);
  });

  it('does not affect other projects', async () => {
    const { projectId: projectA } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    await ctx.db.insert(eventDefinitions).values([
      { project_id: projectA, event_name: 'shared_name', tags: [], verified: false },
      { project_id: projectB, event_name: 'shared_name', tags: [], verified: false },
    ]);

    await ctx.db
      .delete(eventDefinitions)
      .where(and(
        eq(eventDefinitions.project_id, projectA),
        eq(eventDefinitions.event_name, 'shared_name'),
      ));

    const rowsA = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectA));
    const rowsB = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectB));

    expect(rowsA).toHaveLength(0);
    expect(rowsB).toHaveLength(1);
  });
});
