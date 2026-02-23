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

// ── Helper: replicate DefinitionSyncService logic for tests ──────────────────

type ValueType = 'String' | 'Numeric' | 'Boolean' | 'DateTime';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|\s)/;
const DATE_RE = /^((\d{4}[/-][0-2]\d[/-][0-3]\d)|([0-2]\d[/-][0-3]\d[/-]\d{4}))([ T][0-2]\d:[0-6]\d:[0-6]\d.*)?$/;
const MAX_NAME_LENGTH = 200;
const MAX_PROPERTIES_PER_EVENT = 10_000;
const SIX_MONTHS_S = 15_768_000;

const DATETIME_NAME_KEYWORDS = ['time', 'timestamp', 'date', '_at', '-at', 'createdat', 'updatedat'];

function isLikelyDateString(s: string): boolean {
  return ISO_DATE_RE.test(s) || DATE_RE.test(s.trim());
}

function isLikelyUnixTimestamp(n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  const threshold = Math.floor(Date.now() / 1000) - SIX_MONTHS_S;
  return n >= threshold;
}

function detectValueType(key: string, value: unknown): ValueType | null {
  const lowerKey = key.toLowerCase();

  if (lowerKey.startsWith('utm_') || lowerKey.startsWith('$initial_utm_')) return 'String';
  if (lowerKey.startsWith('$feature/')) return 'String';
  if (lowerKey === '$feature_flag_response') return 'String';
  if (lowerKey.startsWith('$survey_response')) return 'String';

  if (DATETIME_NAME_KEYWORDS.some((kw) => lowerKey.includes(kw))) {
    if (typeof value === 'string' && isLikelyDateString(value)) return 'DateTime';
    if (typeof value === 'number' && isLikelyUnixTimestamp(value)) return 'DateTime';
  }

  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') return 'Numeric';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'TRUE' || trimmed === 'FALSE') return 'Boolean';
    if (isLikelyDateString(value)) return 'DateTime';
    if (trimmed !== '' && !isNaN(Number(trimmed))) return 'Numeric';
    return 'String';
  }

  return null;
}

const SKIP_EVENT_PROPERTIES = new Set([
  '$set', '$set_once', '$unset',
  '$group_0', '$group_1', '$group_2', '$group_3', '$group_4', '$groups',
]);

interface PropEntry {
  project_id: string;
  property_name: string;
  property_type: 'event' | 'person';
  value_type: ValueType | null;
}

interface EventPropEntry {
  project_id: string;
  event_name: string;
  property_name: string;
  property_type: 'event' | 'person';
}

function extractProps(
  bag: Record<string, unknown>,
  projectId: string,
  eventName: string,
  type: 'event' | 'person',
  prefix: string,
  propMap: Map<string, PropEntry>,
  eventPropMap: Map<string, EventPropEntry>,
) {
  for (const [k, v] of Object.entries(bag)) {
    if (type === 'event' && SKIP_EVENT_PROPERTIES.has(k)) continue;
    if (k.length > MAX_NAME_LENGTH) continue;

    const property_name = `${prefix}${k}`;
    const detected = detectValueType(k, v);

    const propKey = `${projectId}:${property_name}:${type}`;
    if (!propMap.has(propKey)) {
      propMap.set(propKey, { project_id: projectId, property_name, property_type: type, value_type: detected });
    }

    const epKey = `${projectId}:${eventName}:${property_name}:${type}`;
    if (!eventPropMap.has(epKey)) {
      eventPropMap.set(epKey, { project_id: projectId, event_name: eventName, property_name, property_type: type });
    }
  }
}

async function syncFromBatch(events: Event[]) {
  const now = new Date();
  const eventKeys = new Map<string, { project_id: string; event_name: string }>();
  const propMap = new Map<string, PropEntry>();
  const eventPropMap = new Map<string, EventPropEntry>();

  for (const e of events) {
    // A6: Skip events with name > 200 chars
    if (e.event_name.length > MAX_NAME_LENGTH) continue;

    let parsedProps: Record<string, unknown> | null = null;
    if (e.properties && e.properties !== '{}') {
      try { parsedProps = JSON.parse(e.properties); } catch {}
    }
    let parsedUserProps: Record<string, unknown> | null = null;
    if (e.user_properties && e.user_properties !== '{}') {
      try { parsedUserProps = JSON.parse(e.user_properties); } catch {}
    }

    // A7: Skip entire event (including definition) with too many properties
    const propCount = (parsedProps ? Object.keys(parsedProps).length : 0) +
                      (parsedUserProps ? Object.keys(parsedUserProps).length : 0);
    if (propCount > MAX_PROPERTIES_PER_EVENT) continue;

    const eventKey = `${e.project_id}:${e.event_name}`;
    if (!eventKeys.has(eventKey)) {
      eventKeys.set(eventKey, { project_id: e.project_id, event_name: e.event_name });
    }

    if (parsedProps) {
      extractProps(parsedProps, e.project_id, e.event_name, 'event', 'properties.', propMap, eventPropMap);

      // A10: Extract person properties from $set/$set_once
      const $set = parsedProps['$set'];
      if ($set && typeof $set === 'object' && !Array.isArray($set)) {
        extractProps($set as Record<string, unknown>, e.project_id, e.event_name, 'person', 'user_properties.', propMap, eventPropMap);
      }
      const $setOnce = parsedProps['$set_once'];
      if ($setOnce && typeof $setOnce === 'object' && !Array.isArray($setOnce)) {
        extractProps($setOnce as Record<string, unknown>, e.project_id, e.event_name, 'person', 'user_properties.', propMap, eventPropMap);
      }
    }

    if (parsedUserProps) {
      extractProps(parsedUserProps, e.project_id, e.event_name, 'person', 'user_properties.', propMap, eventPropMap);
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
        set: {
          last_seen_at: sql`excluded.last_seen_at`,
          value_type: sql`COALESCE(${propertyDefinitions.value_type}, excluded.value_type)`,
          is_numerical: sql`CASE WHEN ${propertyDefinitions.value_type} IS NULL THEN excluded.is_numerical ELSE ${propertyDefinitions.is_numerical} END`,
        },
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

    await syncFromBatch([
      buildEvent({ project_id: projectId, person_id: personId, event_name: 'signup' }),
    ]);

    const before = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, 'signup')));

    expect(before).toHaveLength(1);
    const firstSeenAt = before[0].last_seen_at;

    await new Promise((r) => setTimeout(r, 50));

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

    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'purchase',
      description: 'User makes a purchase',
      tags: ['revenue'],
      verified: true,
    });

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

    const olderTime = new Date(Date.now() - 60_000);
    await ctx.db.insert(eventDefinitions).values({
      project_id: projectId,
      event_name: 'old_event',
      last_seen_at: olderTime,
    });

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

    const purchaseProps = await ctx.db
      .select({ property_name: eventProperties.property_name })
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.event_name, 'purchase'),
      ))
      .orderBy(asc(eventProperties.property_name));

    expect(purchaseProps.map((r) => r.property_name)).toEqual(['properties.amount', 'properties.currency']);

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

    const rows = await ctx.db
      .select({ property_name: eventProperties.property_name })
      .from(eventProperties)
      .where(eq(eventProperties.project_id, projectId))
      .groupBy(eventProperties.property_name)
      .orderBy(asc(eventProperties.property_name));

    const names = rows.map((r) => r.property_name);
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

// ══════════════════════════════════════════════════════════════════════════════
// A4: Null/object/array → value_type NULL
// ══════════════════════════════════════════════════════════════════════════════

describe('A4: null/object/array value type handling', () => {
  it('sets value_type to NULL for null values', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ nullable_prop: null }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.nullable_prop'),
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].value_type).toBeNull();
    expect(rows[0].is_numerical).toBe(false);
  });

  it('sets value_type to NULL for object/array values', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({
          nested_obj: { a: 1 },
          arr_prop: [1, 2, 3],
        }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    const objProp = rows.find((r) => r.property_name === 'properties.nested_obj');
    expect(objProp).toBeDefined();
    expect(objProp!.value_type).toBeNull();

    const arrProp = rows.find((r) => r.property_name === 'properties.arr_prop');
    expect(arrProp).toBeDefined();
    expect(arrProp!.value_type).toBeNull();
  });

  it('fills value_type when a primitive value comes after null', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // First batch: null value → value_type = NULL
    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ flexible_prop: null }),
      }),
    ]);

    const before = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.flexible_prop'),
      ));
    expect(before[0].value_type).toBeNull();

    // Second batch: numeric value → value_type should be filled
    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ flexible_prop: 42 }),
      }),
    ]);

    const after = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.flexible_prop'),
      ));
    expect(after[0].value_type).toBe('Numeric');
    expect(after[0].is_numerical).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A5: Hard-coded type overrides
// ══════════════════════════════════════════════════════════════════════════════

describe('A5: hard-coded type overrides', () => {
  it('detects utm_* properties as String even when value is numeric', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ utm_campaign: 12345, utm_source: 'google' }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    const utmCampaign = rows.find((r) => r.property_name === 'properties.utm_campaign');
    expect(utmCampaign).toBeDefined();
    expect(utmCampaign!.value_type).toBe('String');
    expect(utmCampaign!.is_numerical).toBe(false);

    const utmSource = rows.find((r) => r.property_name === 'properties.utm_source');
    expect(utmSource!.value_type).toBe('String');
  });

  it('detects $feature/* properties as String', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ '$feature/dark_mode': true }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, 'properties.$feature/dark_mode'),
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].value_type).toBe('String');
  });

  it('detects DateTime by property name keyword + value', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    const unixTimestamp = Math.floor(Date.now() / 1000);

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({
          login_time: unixTimestamp,
          updated_at: '2025-06-15 12:30:00',
        }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    const loginTime = rows.find((r) => r.property_name === 'properties.login_time');
    expect(loginTime).toBeDefined();
    expect(loginTime!.value_type).toBe('DateTime');

    const updatedAt = rows.find((r) => r.property_name === 'properties.updated_at');
    expect(updatedAt).toBeDefined();
    expect(updatedAt!.value_type).toBe('DateTime');
  });

  it('detects boolean string values ("true"/"false")', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ is_enabled: 'true', is_disabled: 'FALSE' }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    expect(rows.find((r) => r.property_name === 'properties.is_enabled')!.value_type).toBe('Boolean');
    expect(rows.find((r) => r.property_name === 'properties.is_disabled')!.value_type).toBe('Boolean');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A6: Name length limits
// ══════════════════════════════════════════════════════════════════════════════

describe('A6: name length limits', () => {
  it('skips events with name longer than 200 chars', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();
    const longName = 'a'.repeat(201);

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: longName,
        properties: JSON.stringify({ url: '/home' }),
      }),
    ]);

    const eventRows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    expect(eventRows).toHaveLength(0);

    // Properties from skipped events should also not be created
    const propRows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    expect(propRows).toHaveLength(0);
  });

  it('skips properties with name longer than 200 chars', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();
    const longPropName = 'p'.repeat(201);

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({ [longPropName]: 'value', short_name: 'ok' }),
      }),
    ]);

    const rows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    // Only short_name should exist
    expect(rows).toHaveLength(1);
    expect(rows[0].property_name).toBe('properties.short_name');
  });

  it('allows event names exactly 200 chars long', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();
    const exactName = 'x'.repeat(200);

    await syncFromBatch([
      buildEvent({ project_id: projectId, person_id: personId, event_name: exactName }),
    ]);

    const rows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    expect(rows).toHaveLength(1);
    expect(rows[0].event_name).toBe(exactName);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A7: Property count limits
// ══════════════════════════════════════════════════════════════════════════════

describe('A7: property count limits', () => {
  it('skips events with more than 10K properties', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // Create an event with 10,001 properties
    const hugeProps: Record<string, string> = {};
    for (let i = 0; i < 10_001; i++) {
      hugeProps[`prop_${i}`] = 'value';
    }

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'huge_event',
        properties: JSON.stringify(hugeProps),
      }),
    ]);

    // Entire event is skipped including its definition (PostHog behavior)
    const eventRows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));
    expect(eventRows).toHaveLength(0);

    // No properties should be created
    const propRows = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));
    expect(propRows).toHaveLength(0);
  });

  it('allows events with exactly 10K properties', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    const props: Record<string, string> = {};
    for (let i = 0; i < 10_000; i++) {
      props[`p${i}`] = 'v';
    }

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'big_event',
        properties: JSON.stringify(props),
      }),
    ]);

    const eventRows = await ctx.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));
    expect(eventRows).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A9: Skip service properties
// ══════════════════════════════════════════════════════════════════════════════

describe('A9: skip service properties', () => {
  it('skips $set, $set_once, $unset, $group_*, $groups in event properties', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({
          url: '/home',
          $set: { email: 'a@b.com' },
          $set_once: { first_visit: '2025-01-01' },
          $unset: ['old_prop'],
          $group_0: 'org_123',
          $group_1: 'team_456',
          $group_2: 'x',
          $group_3: 'y',
          $group_4: 'z',
          $groups: { company: 'org_123' },
        }),
      }),
    ]);

    const eventProps = await ctx.db
      .select()
      .from(eventProperties)
      .where(and(
        eq(eventProperties.project_id, projectId),
        eq(eventProperties.property_type, 'event'),
      ));

    const eventPropNames = eventProps.map((r) => r.property_name);

    // Only url should be tracked as event property
    expect(eventPropNames).toContain('properties.url');
    expect(eventPropNames).not.toContain('properties.$set');
    expect(eventPropNames).not.toContain('properties.$set_once');
    expect(eventPropNames).not.toContain('properties.$unset');
    expect(eventPropNames).not.toContain('properties.$group_0');
    expect(eventPropNames).not.toContain('properties.$groups');
  });

  it('does NOT skip service property names when they appear in user_properties', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    // Edge case: if $groups somehow appears in user_properties bag, it should NOT be skipped
    // because the skip list only applies to event properties
    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        user_properties: JSON.stringify({ $groups: 'some_value', email: 'test@test.com' }),
      }),
    ]);

    const personProps = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_type, 'person'),
      ));

    const names = personProps.map((r) => r.property_name);
    expect(names).toContain('user_properties.$groups');
    expect(names).toContain('user_properties.email');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A10: $set/$set_once → person property definitions
// ══════════════════════════════════════════════════════════════════════════════

describe('A10: $set/$set_once as person properties', () => {
  it('extracts $set contents as person property definitions', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'signup',
        properties: JSON.stringify({
          url: '/register',
          $set: { email: 'user@example.com', plan: 'pro' },
        }),
      }),
    ]);

    // Event properties
    const eventPropDefs = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_type, 'event'),
      ));

    expect(eventPropDefs.map((r) => r.property_name)).toContain('properties.url');
    // $set itself should not appear as event property
    expect(eventPropDefs.map((r) => r.property_name)).not.toContain('properties.$set');

    // Person properties from $set
    const personPropDefs = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_type, 'person'),
      ))
      .orderBy(asc(propertyDefinitions.property_name));

    const personNames = personPropDefs.map((r) => r.property_name);
    expect(personNames).toContain('user_properties.email');
    expect(personNames).toContain('user_properties.plan');
  });

  it('extracts $set_once contents as person property definitions', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'first_visit',
        properties: JSON.stringify({
          $set_once: { first_seen_at: '2025-01-01T00:00:00Z', referrer: 'google' },
        }),
      }),
    ]);

    const personPropDefs = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_type, 'person'),
      ));

    const names = personPropDefs.map((r) => r.property_name);
    expect(names).toContain('user_properties.first_seen_at');
    expect(names).toContain('user_properties.referrer');
  });

  it('merges $set person props with user_properties bag', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({
          $set: { email: 'a@b.com' },
        }),
        user_properties: JSON.stringify({ name: 'Alice' }),
      }),
    ]);

    const personPropDefs = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_type, 'person'),
      ));

    const names = personPropDefs.map((r) => r.property_name);
    expect(names).toContain('user_properties.email');
    expect(names).toContain('user_properties.name');
  });

  it('ignores $set when it is not an object', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const personId = randomUUID();

    await syncFromBatch([
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        properties: JSON.stringify({
          url: '/home',
          $set: 'not_an_object',
          $set_once: [1, 2, 3],
        }),
      }),
    ]);

    const personPropDefs = await ctx.db
      .select()
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_type, 'person'),
      ));

    // No person properties should be created from invalid $set/$set_once
    expect(personPropDefs).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// detectValueType unit tests
// ══════════════════════════════════════════════════════════════════════════════

describe('detectValueType', () => {
  it('returns correct types for primitives', () => {
    expect(detectValueType('count', 42)).toBe('Numeric');
    expect(detectValueType('count', 3.14)).toBe('Numeric');
    expect(detectValueType('active', true)).toBe('Boolean');
    expect(detectValueType('active', false)).toBe('Boolean');
    expect(detectValueType('url', '/home')).toBe('String');
    expect(detectValueType('url', '')).toBe('String');
  });

  it('returns null for non-primitives', () => {
    expect(detectValueType('data', null)).toBeNull();
    expect(detectValueType('data', { a: 1 })).toBeNull();
    expect(detectValueType('data', [1, 2])).toBeNull();
    expect(detectValueType('data', undefined)).toBeNull();
  });

  it('handles numeric strings', () => {
    expect(detectValueType('count', '42')).toBe('Numeric');
    expect(detectValueType('price', '99.50')).toBe('Numeric');
    expect(detectValueType('count', '  ')).toBe('String');
  });

  it('handles boolean strings', () => {
    expect(detectValueType('flag', 'true')).toBe('Boolean');
    expect(detectValueType('flag', 'false')).toBe('Boolean');
    expect(detectValueType('flag', 'TRUE')).toBe('Boolean');
    expect(detectValueType('flag', 'FALSE')).toBe('Boolean');
  });

  it('handles ISO date strings', () => {
    expect(detectValueType('when', '2025-01-15T10:30:00Z')).toBe('DateTime');
    expect(detectValueType('when', '2025-01-15 10:30:00')).toBe('DateTime');
  });

  it('utm_* overrides return String regardless of value', () => {
    expect(detectValueType('utm_campaign', 12345)).toBe('String');
    expect(detectValueType('utm_source', true)).toBe('String');
    expect(detectValueType('$initial_utm_source', 42)).toBe('String');
  });

  it('$feature/* overrides return String', () => {
    expect(detectValueType('$feature/dark_mode', true)).toBe('String');
    expect(detectValueType('$feature/experiment', 1)).toBe('String');
  });

  it('$survey_response* overrides return String', () => {
    expect(detectValueType('$survey_response', 5)).toBe('String');
    expect(detectValueType('$survey_response_1', true)).toBe('String');
  });

  it('DateTime keyword + numeric unix timestamp', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(detectValueType('login_time', now)).toBe('DateTime');
    expect(detectValueType('created_at', now)).toBe('DateTime');
    expect(detectValueType('updated_at', now)).toBe('DateTime');
  });

  it('DateTime keyword + date string', () => {
    expect(detectValueType('created_at', '2025-06-15 12:30:00')).toBe('DateTime');
    expect(detectValueType('login_time', '2025-01-01T00:00:00Z')).toBe('DateTime');
  });

  it('DateTime keyword does NOT override when value is not a timestamp', () => {
    expect(detectValueType('login_time', 'hello')).toBe('String');
    expect(detectValueType('created_at', 42)).toBe('Numeric'); // too small for unix timestamp
  });
});
