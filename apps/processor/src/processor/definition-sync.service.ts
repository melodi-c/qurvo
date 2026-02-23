import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { sql } from 'drizzle-orm';
import type { Event } from '@qurvo/clickhouse';
import { type Database, eventDefinitions, propertyDefinitions, eventProperties } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';

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

@Injectable()
export class DefinitionSyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(DefinitionSyncService.name) private readonly logger: PinoLogger,
  ) {}

  async syncFromBatch(events: Event[]): Promise<void> {
    try {
      const now = new Date();

      // 1. Collect unique event names per project
      const eventKeys = new Map<string, { project_id: string; event_name: string }>();
      // 2. Collect global property definitions (deduplicated across events)
      const propMap = new Map<string, PropEntry>();
      // 3. Collect event<->property associations
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

            // Global property definition
            const propKey = `${e.project_id}:${property_name}:${type}`;
            const existing = propMap.get(propKey);
            if (!existing) {
              propMap.set(propKey, { project_id: e.project_id, property_name, property_type: type, value_type: detected });
            }
            // Don't overwrite — first type wins (PostHog approach)

            // Event<->property association
            const epKey = `${e.project_id}:${e.event_name}:${property_name}:${type}`;
            if (!eventPropMap.has(epKey)) {
              eventPropMap.set(epKey, { project_id: e.project_id, event_name: e.event_name, property_name, property_type: type });
            }
          }
        }
      }

      // 3. Upsert event_definitions
      if (eventKeys.size > 0) {
        await this.db
          .insert(eventDefinitions)
          .values([...eventKeys.values()].map((r) => ({
            project_id: r.project_id,
            event_name: r.event_name,
            last_seen_at: now,
          })))
          .onConflictDoUpdate({
            target: [eventDefinitions.project_id, eventDefinitions.event_name],
            set: { last_seen_at: sql`excluded.last_seen_at` },
          });
      }

      // 4. Upsert property_definitions (global, first type wins)
      if (propMap.size > 0) {
        await this.db
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
            // value_type NOT updated — first type wins
          });
      }

      // 5. Upsert event_properties
      if (eventPropMap.size > 0) {
        await this.db
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

      this.logger.debug(
        { events: events.length, eventDefs: eventKeys.size, propDefs: propMap.size, eventProps: eventPropMap.size },
        'Definition sync completed',
      );
    } catch (err) {
      this.logger.warn({ err }, 'Definition sync failed (non-critical)');
    }
  }
}
