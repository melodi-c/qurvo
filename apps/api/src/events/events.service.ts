import { Injectable, Inject } from '@nestjs/common';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { queryEvents, queryEventDetail, type EventsQueryParams, type EventRow, type EventDetailRow } from './events.query';
import { queryEventNames } from './event-names.query';
import { queryEventPropertyNames } from './event-property-names.query';
import { NotFoundException } from '@nestjs/common';

const EVENT_NAMES_CACHE_TTL_SECONDS = 3600; // 1 hour
const EVENT_PROPERTY_NAMES_CACHE_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class EventsService {
  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
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
    const cacheKey = `event_names:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];
    const names = await queryEventNames(this.ch, { project_id: projectId });
    await this.redis.set(cacheKey, JSON.stringify(names), 'EX', EVENT_NAMES_CACHE_TTL_SECONDS);
    return names;
  }

  async getEventPropertyNames(userId: string, projectId: string, eventName?: string): Promise<string[]> {
    await this.projectsService.getMembership(userId, projectId);
    const cacheKey = eventName
      ? `event_property_names:${projectId}:${eventName}`
      : `event_property_names:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];
    const names = await queryEventPropertyNames(this.ch, { project_id: projectId, event_name: eventName });
    await this.redis.set(cacheKey, JSON.stringify(names), 'EX', EVENT_PROPERTY_NAMES_CACHE_TTL_SECONDS);
    return names;
  }
}
