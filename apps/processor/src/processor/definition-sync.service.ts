import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { sql } from 'drizzle-orm';
import type { Event } from '@qurvo/clickhouse';
import { type Database, eventDefinitions, propertyDefinitions, eventProperties } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';

export type ValueType = 'String' | 'Numeric' | 'Boolean' | 'DateTime';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|\s)/;
const DATE_RE = /^((\d{4}[/-][0-2]\d[/-][0-3]\d)|([0-2]\d[/-][0-3]\d[/-]\d{4}))([ T][0-2]\d:[0-6]\d:[0-6]\d.*)?$/;
const ONE_HOUR_MS = 3_600_000;
const CACHE_MAX_SIZE = 100_000;
const MAX_NAME_LENGTH = 200;
const MAX_PROPERTIES_PER_EVENT = 10_000;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 50;
const SIX_MONTHS_S = 15_768_000;

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

/** Keywords in property names that hint at DateTime type (PostHog: DATETIME_PROPERTY_NAME_KEYWORDS). */
const DATETIME_NAME_KEYWORDS = ['time', 'timestamp', 'date', '_at', '-at', 'createdat', 'updatedat'];

/** Floor a Date to the start of its hour (e.g. 14:37:22 → 14:00:00). */
function floorToHour(dt: Date): Date {
  return new Date(Math.floor(dt.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);
}

function isLikelyDateString(s: string): boolean {
  return ISO_DATE_RE.test(s) || DATE_RE.test(s.trim());
}

function isLikelyUnixTimestamp(n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  const threshold = Math.floor(Date.now() / 1000) - SIX_MONTHS_S;
  return n >= threshold;
}

/**
 * Detect the value type of a property value.
 *
 * A4: Returns null for null, objects, and arrays (non-primitive values).
 * A5: Hard-coded overrides for utm_*, $feature/*, $survey_response*, and DateTime heuristics.
 *
 * Matches PostHog's `detect_property_type` from property-defs-rs/src/types.rs.
 */
export function detectValueType(key: string, value: unknown): ValueType | null {
  const lowerKey = key.toLowerCase();

  // A5: Hard-coded overrides — always String regardless of value
  if (lowerKey.startsWith('utm_') || lowerKey.startsWith('$initial_utm_')) return 'String';
  if (lowerKey.startsWith('$feature/')) return 'String';
  if (lowerKey === '$feature_flag_response') return 'String';
  if (lowerKey.startsWith('$survey_response')) return 'String';

  // A5: DateTime heuristic by property name + value
  if (DATETIME_NAME_KEYWORDS.some((kw) => lowerKey.includes(kw))) {
    if (typeof value === 'string' && isLikelyDateString(value)) return 'DateTime';
    if (typeof value === 'number' && isLikelyUnixTimestamp(value)) return 'DateTime';
  }

  // Standard type detection
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') return 'Numeric';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'TRUE' || trimmed === 'FALSE') return 'Boolean';
    if (isLikelyDateString(value)) return 'DateTime';
    if (trimmed !== '' && !isNaN(Number(trimmed))) return 'Numeric';
    return 'String';
  }

  // A4: null, objects, arrays → null (property_type stays NULL in DB, will be filled later)
  return null;
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

@Injectable()
export class DefinitionSyncService {
  /** In-memory dedup caches: key → floored hour timestamp (ms). */
  private readonly seenEvents = new Map<string, number>();
  private readonly seenProps = new Map<string, number>();
  private readonly seenEventProps = new Map<string, number>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(DefinitionSyncService.name) private readonly logger: PinoLogger,
  ) {}

  /** Returns true if the key was already seen in the current floored hour. */
  private isCached(cache: Map<string, number>, key: string, flooredMs: number): boolean {
    return cache.get(key) === flooredMs;
  }

  /** Mark keys as seen. Respects CACHE_MAX_SIZE — skips insertion when full. */
  private markSeen(cache: Map<string, number>, keys: Iterable<string>, flooredMs: number): void {
    for (const key of keys) {
      if (cache.size >= CACHE_MAX_SIZE) {
        this.evict(cache, flooredMs);
        if (cache.size >= CACHE_MAX_SIZE) return;
      }
      cache.set(key, flooredMs);
    }
  }

  /** Remove all entries from the given cache that match the specified keys. */
  private uncache(cache: Map<string, number>, keys: Iterable<string>): void {
    for (const key of keys) cache.delete(key);
  }

  /** Remove entries from previous hours when cache is full. */
  private evict(cache: Map<string, number>, currentFlooredMs: number): void {
    for (const [k, v] of cache) {
      if (v < currentFlooredMs) cache.delete(k);
    }
  }

  /**
   * Retry a DB operation with linear backoff + jitter (PostHog approach).
   * On exhausted retries, uncaches keys so they get another chance on next batch.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    uncacheFn?: () => void,
  ): Promise<T> {
    let tries = 1;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        if (tries >= RETRY_MAX_ATTEMPTS) {
          this.logger.error({ err, tries }, `${label} exhausted retries`);
          uncacheFn?.();
          throw err;
        }
        const jitter = Math.floor(Math.random() * 50);
        const delay = tries * RETRY_BASE_DELAY_MS + jitter;
        this.logger.warn({ err, tries, delay }, `${label} retry`);
        await new Promise((r) => setTimeout(r, delay));
        tries++;
      }
    }
  }

  /**
   * Extract properties from a parsed JSON object, applying skip-list and name-length limits.
   * A9: Skips service properties ($set, $set_once, $unset, $group_*, $groups) for event type.
   * A6: Skips property names longer than MAX_NAME_LENGTH.
   */
  private extractProps(
    bag: Record<string, unknown>,
    projectId: string,
    eventName: string,
    type: 'event' | 'person',
    prefix: string,
    propMap: Map<string, PropEntry>,
    eventPropMap: Map<string, EventPropEntry>,
    flooredMs: number,
  ): void {
    for (const [k, v] of Object.entries(bag)) {
      // A9: Skip service properties for event type only
      if (type === 'event' && SKIP_EVENT_PROPERTIES.has(k)) continue;

      // A6: Skip properties with names longer than 200 chars
      if (k.length > MAX_NAME_LENGTH) continue;

      const property_name = `${prefix}${k}`;
      const detected = detectValueType(k, v);

      // Global property definition
      const propKey = `${projectId}:${property_name}:${type}`;
      if (!propMap.has(propKey) && !this.isCached(this.seenProps, propKey, flooredMs)) {
        propMap.set(propKey, { project_id: projectId, property_name, property_type: type, value_type: detected });
      }

      // Event<->property association
      const epKey = `${projectId}:${eventName}:${property_name}:${type}`;
      if (!eventPropMap.has(epKey) && !this.isCached(this.seenEventProps, epKey, flooredMs)) {
        eventPropMap.set(epKey, { project_id: projectId, event_name: eventName, property_name, property_type: type });
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
      if (!eventKeys.has(eventKey) && !this.isCached(this.seenEvents, eventKey, flooredMs)) {
        eventKeys.set(eventKey, { project_id: e.project_id, event_name: e.event_name });
      }

      // Extract event properties
      if (parsedProps) {
        this.extractProps(parsedProps, e.project_id, e.event_name, 'event', 'properties.', propMap, eventPropMap, flooredMs);

        // A10: Extract person properties from $set/$set_once inside properties
        const $set = parsedProps['$set'];
        if ($set && typeof $set === 'object' && !Array.isArray($set)) {
          this.extractProps($set as Record<string, unknown>, e.project_id, e.event_name, 'person', 'user_properties.', propMap, eventPropMap, flooredMs);
        }
        const $setOnce = parsedProps['$set_once'];
        if ($setOnce && typeof $setOnce === 'object' && !Array.isArray($setOnce)) {
          this.extractProps($setOnce as Record<string, unknown>, e.project_id, e.event_name, 'person', 'user_properties.', propMap, eventPropMap, flooredMs);
        }
      }

      // Extract user/person properties
      if (parsedUserProps) {
        this.extractProps(parsedUserProps, e.project_id, e.event_name, 'person', 'user_properties.', propMap, eventPropMap, flooredMs);
      }
    }

    // 4. Upsert event_definitions (A3: with retry)
    if (eventKeys.size > 0) {
      await this.withRetry(
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
        () => this.uncache(this.seenEvents, eventKeys.keys()),
      );
    }

    // 5. Upsert property_definitions (A3: with retry, A4: handle null value_type)
    if (propMap.size > 0) {
      await this.withRetry(
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
        () => this.uncache(this.seenProps, propMap.keys()),
      );
    }

    // 6. Upsert event_properties (A3: with retry)
    if (eventPropMap.size > 0) {
      await this.withRetry(
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
        () => this.uncache(this.seenEventProps, eventPropMap.keys()),
      );
    }

    // 7. Mark as seen only after all upserts succeeded
    this.markSeen(this.seenEvents, eventKeys.keys(), flooredMs);
    this.markSeen(this.seenProps, propMap.keys(), flooredMs);
    this.markSeen(this.seenEventProps, eventPropMap.keys(), flooredMs);

    this.logger.debug(
      { events: events.length, eventDefs: eventKeys.size, propDefs: propMap.size, eventProps: eventPropMap.size },
      'Definition sync completed',
    );
  }
}
