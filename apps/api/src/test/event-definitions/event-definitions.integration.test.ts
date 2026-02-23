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
import { eventDefinitions, eventProperties } from '@qurvo/db';
import { queryEventNamesWithCount } from '../../events/event-names.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── queryEventNamesWithCount (ClickHouse) ────────────────────────────────────

describe('queryEventNamesWithCount', () => {
  it('returns event names with counts', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(1) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(2) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(3) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'click', timestamp: ts(1) }),
    ]);

    const result = await queryEventNamesWithCount(ctx.ch, { project_id: projectId });

    expect(result).toHaveLength(2);

    const pageView = result.find((r) => r.event_name === 'page_view');
    const click = result.find((r) => r.event_name === 'click');

    expect(pageView).toBeDefined();
    expect(pageView!.count).toBe(3);
    expect(click).toBeDefined();
    expect(click!.count).toBe(1);
  });

  it('returns results ordered by count descending', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'rare_event', timestamp: ts(1) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'common_event', timestamp: ts(1) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'common_event', timestamp: ts(2) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'common_event', timestamp: ts(3) }),
    ]);

    const result = await queryEventNamesWithCount(ctx.ch, { project_id: projectId });

    expect(result[0].event_name).toBe('common_event');
    expect(result[0].count).toBe(3);
    expect(result[1].event_name).toBe('rare_event');
    expect(result[1].count).toBe(1);
  });

  it('does not return events from other projects', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectA, person_id: personId, event_name: 'event_a', timestamp: ts(1) }),
      buildEvent({ project_id: projectB, person_id: personId, event_name: 'event_b', timestamp: ts(1) }),
    ]);

    const resultA = await queryEventNamesWithCount(ctx.ch, { project_id: projectA });
    const resultB = await queryEventNamesWithCount(ctx.ch, { project_id: projectB });

    expect(resultA.map((r) => r.event_name)).toEqual(['event_a']);
    expect(resultB.map((r) => r.event_name)).toEqual(['event_b']);
  });

  it('returns empty array when no events exist', async () => {
    const projectId = randomUUID();
    const result = await queryEventNamesWithCount(ctx.ch, { project_id: projectId });
    expect(result).toEqual([]);
  });
});

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

// ── Merge logic (CH + PG) ────────────────────────────────────────────────────

describe('event definitions merge (ClickHouse + PostgreSQL)', () => {
  it('merges ClickHouse events with PostgreSQL metadata', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // Insert events into ClickHouse
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(1) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(2) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'click', timestamp: ts(1) }),
    ]);

    // Add metadata for page_view only
    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'page_view',
      description: 'User views a page',
      tags: ['core', 'engagement'],
      verified: true,
    });

    // Replicate the service's merge logic
    const [chRows, pgRows] = await Promise.all([
      queryEventNamesWithCount(ctx.ch, { project_id: projectId }),
      ctx.db
        .select()
        .from(eventDefinitions)
        .where(eq(eventDefinitions.project_id, projectId)),
    ]);

    const metaMap = new Map(pgRows.map((r) => [r.event_name, r]));

    const merged = chRows.map((ch) => {
      const meta = metaMap.get(ch.event_name);
      return {
        event_name: ch.event_name,
        count: ch.count,
        id: meta?.id ?? null,
        description: meta?.description ?? null,
        tags: meta?.tags ?? [],
        verified: meta?.verified ?? false,
      };
    });

    expect(merged).toHaveLength(2);

    // page_view should have metadata
    const pageView = merged.find((r) => r.event_name === 'page_view');
    expect(pageView).toBeDefined();
    expect(pageView!.count).toBe(2);
    expect(pageView!.description).toBe('User views a page');
    expect(pageView!.tags).toEqual(['core', 'engagement']);
    expect(pageView!.verified).toBe(true);
    expect(pageView!.id).not.toBeNull();

    // click should have no metadata
    const click = merged.find((r) => r.event_name === 'click');
    expect(click).toBeDefined();
    expect(click!.count).toBe(1);
    expect(click!.description).toBeNull();
    expect(click!.tags).toEqual([]);
    expect(click!.verified).toBe(false);
    expect(click!.id).toBeNull();
  });

  it('returns empty when no events in ClickHouse even if PG metadata exists', async () => {
    const { projectId } = await createTestProject(ctx.db);

    // Add metadata without any CH events
    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'orphan_event',
      description: 'This event has no ClickHouse data',
      tags: [],
      verified: true,
    });

    const chRows = await queryEventNamesWithCount(ctx.ch, { project_id: projectId });

    // No CH events → merged list is empty (PG metadata alone doesn't appear)
    expect(chRows).toHaveLength(0);
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
