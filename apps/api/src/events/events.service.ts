import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, asc } from 'drizzle-orm';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { eventDefinitions, eventProperties, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { queryEvents, queryEventDetail, type EventsQueryParams, type EventRow, type EventDetailRow } from './events.query';
import { DIRECT_COLUMNS } from '../utils/property-filter';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class EventsService {
  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async getEvents(userId: string, params: EventsQueryParams): Promise<EventRow[]> {
    await this.projectsService.getMembership(userId, params.project_id);
    return queryEvents(this.ch, params);
  }

  async getEventDetail(userId: string, projectId: string, eventId: string): Promise<EventDetailRow> {
    await this.projectsService.getMembership(userId, projectId);
    const row = await queryEventDetail(this.ch, { project_id: projectId, event_id: eventId });
    if (!row) throw new NotFoundException('Event not found');
    return row;
  }

  async getEventNames(userId: string, projectId: string): Promise<string[]> {
    await this.projectsService.getMembership(userId, projectId);
    const rows = await this.db
      .select({ event_name: eventDefinitions.event_name })
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId))
      .orderBy(desc(eventDefinitions.last_seen_at));
    return rows.map((r) => r.event_name);
  }

  async getEventPropertyNames(userId: string, projectId: string, eventName?: string): Promise<string[]> {
    await this.projectsService.getMembership(userId, projectId);

    if (eventName) {
      // Event-scoped: query event_properties
      const rows = await this.db
        .select({ property_name: eventProperties.property_name })
        .from(eventProperties)
        .where(and(
          eq(eventProperties.project_id, projectId),
          eq(eventProperties.event_name, eventName),
        ))
        .orderBy(desc(eventProperties.last_seen_at));

      const jsonKeys = rows.map((r) => r.property_name);
      const directCols = [...DIRECT_COLUMNS].sort();
      return [...directCols, ...jsonKeys];
    }

    // Global: query all distinct property names from event_properties
    const rows = await this.db
      .select({ property_name: eventProperties.property_name })
      .from(eventProperties)
      .where(eq(eventProperties.project_id, projectId))
      .groupBy(eventProperties.property_name)
      .orderBy(asc(eventProperties.property_name));

    const jsonKeys = rows.map((r) => r.property_name);
    const directCols = [...DIRECT_COLUMNS].sort();
    return [...directCols, ...jsonKeys];
  }
}
