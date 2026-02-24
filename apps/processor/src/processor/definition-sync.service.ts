import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { Event } from '@qurvo/clickhouse';
import { type Database, eventDefinitions, propertyDefinitions, eventProperties } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import { RETRY_DEFINITIONS } from '../constants';
import { withRetry } from './retry';
import { HourlyCache } from './hourly-cache';
import { type ValueType, detectValueType } from './value-type';

const ONE_HOUR_MS = 3_600_000;
const MAX_NAME_LENGTH = 200;
const MAX_PROPERTIES_PER_EVENT = 10_000;

/** Properties to skip when extracting event property definitions (PostHog: SKIP_PROPERTIES). */
const SKIP_EVENT_PROPERTIES = new Set([
  '$set',
  '$set_once',
  '$unset',
  '$group_0',
  '$group_1',
  '$group_2',
  '$group_3',
  '$group_4',
  '$groups',
]);

/** Floor a Date to the start of its hour (e.g. 14:37:22 → 14:00:00). */
function floorToHour(dt: Date): Date {
  return new Date(Math.floor(dt.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);
}

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

/** Shared context for property extraction within a single event. */
interface SyncContext {
  projectId: string;
  eventName: string;
  flooredMs: number;
  propMap: Map<string, PropEntry>;
  eventPropMap: Map<string, EventPropEntry>;
}

@Injectable()
export class DefinitionSyncService {
  private readonly seenEvents = new HourlyCache();
  private readonly seenProps = new HourlyCache();
  private readonly seenEventProps = new HourlyCache();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectPinoLogger(DefinitionSyncService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Extract properties from a parsed JSON object, applying skip-list and name-length limits.
   * A9: Skips service properties ($set, $set_once, $unset, $group_*, $groups) for event type.
   * A6: Skips property names longer than MAX_NAME_LENGTH.
   */
  private extractProps(
    bag: Record<string, unknown>,
    type: 'event' | 'person',
    prefix: string,
    ctx: SyncContext,
  ): void {
    for (const [k, v] of Object.entries(bag)) {
      // A9: Skip service properties for event type only
      if (type === 'event' && SKIP_EVENT_PROPERTIES.has(k)) continue;

      // A6: Skip properties with names longer than 200 chars
      if (k.length > MAX_NAME_LENGTH) continue;

      const property_name = `${prefix}${k}`;
      const detected = detectValueType(k, v);

      // Global property definition
      const propKey = `${ctx.projectId}:${property_name}:${type}`;
      if (!ctx.propMap.has(propKey) && !this.seenProps.has(propKey, ctx.flooredMs)) {
        ctx.propMap.set(propKey, { project_id: ctx.projectId, property_name, property_type: type, value_type: detected });
      }

      // Event<->property association
      const epKey = `${ctx.projectId}:${ctx.eventName}:${property_name}:${type}`;
      if (!ctx.eventPropMap.has(epKey) && !this.seenEventProps.has(epKey, ctx.flooredMs)) {
        ctx.eventPropMap.set(epKey, { project_id: ctx.projectId, event_name: ctx.eventName, property_name, property_type: type });
      }
    }
  }

  async syncFromBatch(events: Event[]): Promise<void> {
    const now = floorToHour(new Date());
    const flooredMs = now.getTime();

    // 1. Collect unique event names per project
    const eventKeys = new Map<string, { project_id: string; event_name: string }>();
    // 2. Collect global property definitions (deduplicated across events)
    const propMap = new Map<string, PropEntry>();
    // 3. Collect event<->property associations
    const eventPropMap = new Map<string, EventPropEntry>();

    for (const e of events) {
      // A6: Skip events with names longer than 200 chars
      if (e.event_name.length > MAX_NAME_LENGTH) continue;

      // Parse properties early to check count before collecting anything
      let parsedProps: Record<string, unknown> | null = null;
      if (e.properties && e.properties !== '{}') {
        try { parsedProps = JSON.parse(e.properties); } catch {}
      }

      let parsedUserProps: Record<string, unknown> | null = null;
      if (e.user_properties && e.user_properties !== '{}') {
        try { parsedUserProps = JSON.parse(e.user_properties); } catch {}
      }

      // A7: Skip entire event (including its definition) when too many properties
      const propCount = (parsedProps ? Object.keys(parsedProps).length : 0) +
                        (parsedUserProps ? Object.keys(parsedUserProps).length : 0);
      if (propCount > MAX_PROPERTIES_PER_EVENT) {
        this.logger.warn(
          { event_name: e.event_name, project_id: e.project_id, propCount },
          'Skipping event with too many properties',
        );
        continue;
      }

      const eventKey = `${e.project_id}:${e.event_name}`;
      if (!eventKeys.has(eventKey) && !this.seenEvents.has(eventKey, flooredMs)) {
        eventKeys.set(eventKey, { project_id: e.project_id, event_name: e.event_name });
      }

      const ctx: SyncContext = { projectId: e.project_id, eventName: e.event_name, flooredMs, propMap, eventPropMap };

      // Extract event properties
      if (parsedProps) {
        this.extractProps(parsedProps, 'event', 'properties.', ctx);

        // A10: Extract person properties from $set/$set_once inside properties
        const $set = parsedProps['$set'];
        if ($set && typeof $set === 'object' && !Array.isArray($set)) {
          this.extractProps($set as Record<string, unknown>, 'person', 'user_properties.', ctx);
        }
        const $setOnce = parsedProps['$set_once'];
        if ($setOnce && typeof $setOnce === 'object' && !Array.isArray($setOnce)) {
          this.extractProps($setOnce as Record<string, unknown>, 'person', 'user_properties.', ctx);
        }
      }

      // Extract user/person properties
      if (parsedUserProps) {
        this.extractProps(parsedUserProps, 'person', 'user_properties.', ctx);
      }
    }

    // 4. Upsert event_definitions (A3: with retry)
    if (eventKeys.size > 0) {
      await withRetry(
        () => this.db
          .insert(eventDefinitions)
          .values([...eventKeys.values()].map((r) => ({
            project_id: r.project_id,
            event_name: r.event_name,
            last_seen_at: now,
          })))
          .onConflictDoUpdate({
            target: [eventDefinitions.project_id, eventDefinitions.event_name],
            set: { last_seen_at: sql`excluded.last_seen_at` },
            setWhere: sql`${eventDefinitions.last_seen_at} < excluded.last_seen_at`,
          }),
        'event_definitions upsert',
        this.logger,
        { ...RETRY_DEFINITIONS, onExhausted: () => this.seenEvents.uncache(eventKeys.keys()) },
      );
    }

    // 5. Upsert property_definitions (A3: with retry, A4: handle null value_type)
    if (propMap.size > 0) {
      await withRetry(
        () => this.db
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
              // A4: Update value_type only when current is NULL — first non-null type wins
              value_type: sql`COALESCE(${propertyDefinitions.value_type}, excluded.value_type)`,
              is_numerical: sql`CASE WHEN ${propertyDefinitions.value_type} IS NULL THEN excluded.is_numerical ELSE ${propertyDefinitions.is_numerical} END`,
            },
            setWhere: sql`${propertyDefinitions.last_seen_at} < excluded.last_seen_at OR ${propertyDefinitions.value_type} IS NULL`,
          }),
        'property_definitions upsert',
        this.logger,
        { ...RETRY_DEFINITIONS, onExhausted: () => this.seenProps.uncache(propMap.keys()) },
      );
    }

    // 6. Upsert event_properties (A3: with retry)
    if (eventPropMap.size > 0) {
      await withRetry(
        () => this.db
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
            setWhere: sql`${eventProperties.last_seen_at} < excluded.last_seen_at`,
          }),
        'event_properties upsert',
        this.logger,
        { ...RETRY_DEFINITIONS, onExhausted: () => this.seenEventProps.uncache(eventPropMap.keys()) },
      );
    }

    // 7. Mark as seen only after all upserts succeeded
    if (!this.seenEvents.markSeen(eventKeys.keys(), flooredMs)) {
      this.logger.warn({ cacheSize: this.seenEvents.size }, 'Event definitions cache full after eviction');
    }
    if (!this.seenProps.markSeen(propMap.keys(), flooredMs)) {
      this.logger.warn({ cacheSize: this.seenProps.size }, 'Property definitions cache full after eviction');
    }
    if (!this.seenEventProps.markSeen(eventPropMap.keys(), flooredMs)) {
      this.logger.warn({ cacheSize: this.seenEventProps.size }, 'Event-property cache full after eviction');
    }

    // 8. Invalidate API metadata caches for affected projects
    await this.invalidateCaches(eventKeys, propMap, eventPropMap);

    this.logger.debug(
      { events: events.length, eventDefs: eventKeys.size, propDefs: propMap.size, eventProps: eventPropMap.size },
      'Definition sync completed',
    );
  }

  private async invalidateCaches(
    eventKeys: Map<string, { project_id: string; event_name: string }>,
    propMap: Map<string, PropEntry>,
    eventPropMap: Map<string, EventPropEntry>,
  ): Promise<void> {
    const projectsWithNewEvents = new Set<string>();
    const projectsWithNewProps = new Set<string>();

    for (const { project_id } of eventKeys.values()) {
      projectsWithNewEvents.add(project_id);
    }
    for (const { project_id } of propMap.values()) {
      projectsWithNewProps.add(project_id);
    }
    for (const { project_id } of eventPropMap.values()) {
      projectsWithNewProps.add(project_id);
    }

    const keysToDelete: string[] = [];
    for (const pid of projectsWithNewEvents) {
      keysToDelete.push(`event_names:${pid}`);
    }
    for (const pid of projectsWithNewProps) {
      keysToDelete.push(`event_property_names:${pid}`);
    }

    if (keysToDelete.length > 0) {
      try {
        await this.redis.del(...keysToDelete);
      } catch (err) {
        this.logger.warn({ err }, 'Failed to invalidate metadata caches');
      }
    }
  }
}
