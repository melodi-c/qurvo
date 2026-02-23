import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq, and, desc, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  setupContainers,
  buildEvent,
  createTestProject,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { eventDefinitions, propertyDefinitions, eventProperties } from '@qurvo/db';
import type { Event } from '@qurvo/clickhouse';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── Helper: replicate DefinitionSyncService.syncFromBatch logic ──────────────

type ValueType = 'String' | 'Numeric' | 'Boolean' | 'DateTime';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|\s)/;

function detectValueType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') return 'Numeric';
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) return 'DateTime';
    if (value.trim() !== '' && !isNaN(Number(value))) return 'Numeric';
  }
  return 'String';
}

interface PropEntry {
  project_id: string;
  property_name: string;
  property_type: 'event' | 'person';
  value_type: ValueType;
}

interface EventPropEntry {
  project_id: string;
  event_name: string;
  property_name: string;
  property_type: 'event' | 'person';
}

async function syncFromBatch(events: Event[]) {
  const now = new Date();
  const eventKeys = new Map<string, { project_id: string; event_name: string }>();
  const propMap = new Map<string, PropEntry>();
  const eventPropMap = new Map<string, EventPropEntry>();

  for (const e of events) {
    const eventKey = `${e.project_id}:${e.event_name}`;
    if (!eventKeys.has(eventKey)) {
      eventKeys.set(eventKey, { project_id: e.project_id, event_name: e.event_name });
    }

    const bags: Array<{ bag: Record<string, unknown>; type: 'event' | 'person'; prefix: string }> = [];
    if (e.properties && e.properties !== '{}') {
      try { bags.push({ bag: JSON.parse(e.properties), type: 'event', prefix: 'properties.' }); } catch {}
    }
    if (e.user_properties && e.user_properties !== '{}') {
      try { bags.push({ bag: JSON.parse(e.user_properties), type: 'person', prefix: 'user_properties.' }); } catch {}
    }

    for (const { bag, type, prefix } of bags) {
      for (const [k, v] of Object.entries(bag)) {
        const property_name = `${prefix}${k}`;
        const detected = detectValueType(v);
        const propKey = `${e.project_id}:${property_name}:${type}`;
        if (!propMap.has(propKey)) {
          propMap.set(propKey, { project_id: e.project_id, property_name, property_type: type, value_type: detected });
        }
        const epKey = `${e.project_id}:${e.event_name}:${property_name}:${type}`;
        if (!eventPropMap.has(epKey)) {
          eventPropMap.set(epKey, { project_id: e.project_id, event_name: e.event_name, property_name, property_type: type });
        }
      }
    }
  }

  if (eventKeys.size > 0) {
    await ctx.db
      .insert(eventDefinitions)
      .values([...eventKeys.values()].map((r) => ({ project_id: r.project_id, event_name: r.event_name, last_seen_at: now })))
      .onConflictDoUpdate({
        target: [eventDefinitions.project_id, eventDefinitions.event_name],
        set: { last_seen_at: sql`excluded.last_seen_at` },
      });
  }

  if (propMap.size > 0) {
    await ctx.db
      .insert(propertyDefinitions)
      .values([...propMap.values()].map((p) => ({
        project_id: p.project_id,
        property_name: p.property_name,
        property_type: p.property_type,
        value_type: p.value_type,
        is_numerical: p.value_type === 'Numeric',
        last_seen_at: now,
      })))
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
        set: { last_seen_at: sql`excluded.last_seen_at` },
      });
  }

  if (eventPropMap.size > 0) {
    await ctx.db
      .insert(eventProperties)
      .values([...eventPropMap.values()].map((ep) => ({
        project_id: ep.project_id,
        event_name: ep.event_name,
        property_name: ep.property_name,
        property_type: ep.property_type,
        last_seen_at: now,
      })))
      .onConflictDoUpdate({
        target: [eventProperties.project_id, eventProperties.event_name, eventProperties.property_name, eventProperties.property_type],
        set: { last_seen_at: sql`excluded.last_seen_at` },
      });
  }
}

// ── event_definitions auto-population ────────────────────────────────────────

describe('event_definitions auto-population', () => {
  it('creates event definitions from a batch of events', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    const events = [
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(1) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'page_view', timestamp: ts(2) }),
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'click', timestamp: ts(1) }),
    ];

    await syncFromBatch(events);

    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId))
      .orderBy(asc(eventDefinitions.event_name));

    expect(rows).toHaveLength(2);
    expect(rows[0].event_name).toBe('click');
    expect(rows[1].event_name).toBe('page_view');
    expect(rows[0].last_seen_at).toBeInstanceOf(Date);
    expect(rows[0].description).toBeNull();
    expect(rows[0].verified).toBe(false);
  });

  it('updates last_seen_at on subsequent batches', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // First batch
    await syncFromBatch([
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'signup' }),
    ]);

    const before = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, 'signup')));

    expect(before).toHaveLength(1);
    const firstSeenAt = before[0].last_seen_at;

    // Wait a tiny bit so timestamp differs
    await new Promise((r) => setTimeout(r, 50));

    // Second batch
    await syncFromBatch([
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'signup' }),
    ]);

    const after = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, 'signup')));

    expect(after).toHaveLength(1);
    expect(after[0].last_seen_at.getTime()).toBeGreaterThanOrEqual(firstSeenAt.getTime());
  });

  it('preserves user-set metadata (description, tags, verified)', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // User manually sets metadata
    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'purchase',
      description: 'User makes a purchase',
      tags: ['revenue'],
      verified: true,
    });

    // Processor sync overwrites only last_seen_at
    await syncFromBatch([
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'purchase' }),
    ]);

    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, 'purchase')));

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('User makes a purchase');
    expect(rows[0].tags).toEqual(['revenue']);
    expect(rows[0].verified).toBe(true);
  });

  it('isolates definitions between projects', async () => {
    const { projectId: projectA } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({ project_id: projectA, person_id: personId, event_name: 'event_a' }),
      buildEvent({ project_id: projectB, person_id: personId, event_name: 'event_b' }),
    ]);

    const rowsA = await ctx.db.select().from(eventDefinitions).where(eq(eventDefinitions.project_id, projectA));
    const rowsB = await ctx.db.select().from(eventDefinitions).where(eq(eventDefinitions.project_id, projectB));

    expect(rowsA.map((r) => r.event_name)).toEqual(['event_a']);
    expect(rowsB.map((r) => r.event_name)).toEqual(['event_b']);
  });
});

// ── property_definitions auto-population ─────────────────────────────────────

describe('property_definitions auto-population', () => {
  it('creates property definitions from event properties', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        properties: JSON.stringify({ url: '/home', count: 42 }),
        user_properties: JSON.stringify({ email: 'test@example.com' }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId))
      .orderBy(asc(propertyDefinitions.property_name));

    expect(rows).toHaveLength(3);

    const urlProp = rows.find((r) => r.property_name === 'properties.url');
    expect(urlProp).toBeDefined();
    expect(urlProp!.property_type).toBe('event');
    expect(urlProp!.value_type).toBe('String');
    expect(urlProp!.is_numerical).toBe(false);

    const countProp = rows.find((r) => r.property_name === 'properties.count');
    expect(countProp).toBeDefined();
    expect(countProp!.property_type).toBe('event');
    expect(countProp!.value_type).toBe('Numeric');
    expect(countProp!.is_numerical).toBe(true);

    const emailProp = rows.find((r) => r.property_name === 'user_properties.email');
    expect(emailProp).toBeDefined();
    expect(emailProp!.property_type).toBe('person');
    expect(emailProp!.value_type).toBe('String');
  });

  it('detects Boolean and DateTime types', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({
          is_active: true,
          created_at: '2025-01-15T10:30:00Z',
        }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    const boolProp = rows.find((r) => r.property_name === 'properties.is_active');
    expect(boolProp).toBeDefined();
    expect(boolProp!.value_type).toBe('Boolean');

    const dateProp = rows.find((r) => r.property_name === 'properties.created_at');
    expect(dateProp).toBeDefined();
    expect(dateProp!.value_type).toBe('DateTime');
  });

  it('first type wins — does not overwrite value_type on subsequent batches', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // First batch: amount is a number
    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 99.50 }),
      }),
    ]);

    const before = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.amount'),
      ));

    expect(before[0].value_type).toBe('Numeric');

    // Second batch: amount is a string (different type)
    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 'free' }),
      }),
    ]);

    const after = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.amount'),
      ));

    // Type should NOT have changed — first type wins
    expect(after[0].value_type).toBe('Numeric');
    expect(after).toHaveLength(1);
  });

  it('deduplicates properties across events in the same batch', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        properties: JSON.stringify({ url: '/home' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'click',
        properties: JSON.stringify({ url: '/about' }),
      }),
    ]);

    // property_definitions should have one entry for properties.url (global)
    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.url'),
      ));

    expect(rows).toHaveLength(1);
  });
});

// ── event_properties join table ──────────────────────────────────────────────

describe('event_properties join table', () => {
  it('creates per-event property associations', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        properties: JSON.stringify({ url: '/home', title: 'Home' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'click',
        properties: JSON.stringify({ url: '/about', element: 'button' }),
      }),
    ]);

    const pvProps = await ctx.db
      .select()
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'page_view'),
      ))
      .orderBy(asc(eventProperties.property_name));

    const clickProps = await ctx.db
      .select()
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'click'),
      ))
      .orderBy(asc(eventProperties.property_name));

    expect(pvProps.map((r) => r.property_name)).toEqual(['properties.title', 'properties.url']);
    expect(clickProps.map((r) => r.property_name)).toEqual(['properties.element', 'properties.url']);
  });

  it('tracks both event and person property types', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'signup',
        properties: JSON.stringify({ plan: 'pro' }),
        user_properties: JSON.stringify({ name: 'John' }),
      }),
    ]);

    const allProps = await ctx.db
      .select()
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'signup'),
      ));

    const eventType = allProps.find((r) => r.property_type === 'event');
    const personType = allProps.find((r) => r.property_type === 'person');

    expect(eventType).toBeDefined();
    expect(eventType!.property_name).toBe('properties.plan');
    expect(personType).toBeDefined();
    expect(personType!.property_name).toBe('user_properties.name');
  });

  it('does not duplicate on repeated syncs', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    const event = buildEvent({
      project_id: projectId,
      person_id: personId,
      event_name: 'test',
      properties: JSON.stringify({ key: 'value' }),
    });

    await syncFromBatch([event]);
    await syncFromBatch([event]);
    await syncFromBatch([event]);

    const rows = await ctx.db
      .select()
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'test'),
      ));

    expect(rows).toHaveLength(1);
  });
});

// ── API queries (PG-based) ───────────────────────────────────────────────────

describe('API queries from PostgreSQL', () => {
  it('getEventNames returns names ordered by last_seen_at desc', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // Insert older event
    const olderTime = new Date(Date.now() - 60_000);
    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'old_event',
      last_seen_at: olderTime,
    });

    // Insert newer event via sync
    await syncFromBatch([
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'new_event' }),
    ]);

    const rows = await ctx.db
      .select({ event_name: eventDefinitions.event_name })
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId))
      .orderBy(desc(eventDefinitions.last_seen_at));

    const names = rows.map((r) => r.event_name);
    expect(names[0]).toBe('new_event');
    expect(names[1]).toBe('old_event');
  });

  it('getEventPropertyNames returns property names for a specific event', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 100, currency: 'USD' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        properties: JSON.stringify({ url: '/home' }),
      }),
    ]);

    // Event-scoped query
    const purchaseProps = await ctx.db
      .select({ property_name: eventProperties.property_name })
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'purchase'),
      ))
      .orderBy(asc(eventProperties.property_name));

    expect(purchaseProps.map((r) => r.property_name)).toEqual(['properties.amount', 'properties.currency']);

    // Should NOT include page_view properties
    const pvProps = await ctx.db
      .select({ property_name: eventProperties.property_name })
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'page_view'),
      ));

    expect(pvProps.map((r) => r.property_name)).toEqual(['properties.url']);
  });

  it('global property list returns distinct names across events', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'purchase',
        properties: JSON.stringify({ url: '/checkout', amount: 100 }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        properties: JSON.stringify({ url: '/home' }),
      }),
    ]);

    // Global: distinct property names via groupBy
    const rows = await ctx.db
      .select({ property_name: eventProperties.property_name })
      .from(eventProperties)
      .where(eq(eventProperties.project_id, projectId))
      .groupBy(eventProperties.property_name)
      .orderBy(asc(eventProperties.property_name));

    const names = rows.map((r) => r.property_name);
    // url appears in both events but should be deduplicated
    expect(names).toEqual(['properties.amount', 'properties.url']);
  });

  it('property definitions list returns metadata with value_type', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ count: 42, name: 'hello', active: true }),
      }),
    ]);

    // Set description on one property
    await ctx.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: 'properties.count',
        property_type: 'event',
        value_type: 'Numeric',
        is_numerical: true,
        description: 'Number of items',
      })
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
        set: { description: 'Number of items' },
      });

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId))
      .orderBy(asc(propertyDefinitions.property_name));

    expect(rows.length).toBeGreaterThanOrEqual(3);

    const countProp = rows.find((r) => r.property_name === 'properties.count');
    expect(countProp).toBeDefined();
    expect(countProp!.value_type).toBe('Numeric');
    expect(countProp!.is_numerical).toBe(true);
    expect(countProp!.description).toBe('Number of items');

    const activeProp = rows.find((r) => r.property_name === 'properties.active');
    expect(activeProp).toBeDefined();
    expect(activeProp!.value_type).toBe('Boolean');
  });
});
