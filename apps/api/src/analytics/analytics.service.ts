import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@shot/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { queryFunnel, type FunnelQueryParams, type FunnelQueryResult } from './queries/funnel.query';
import { queryEvents, type EventsQueryParams, type EventRow } from './queries/events.query';
import { queryEventNames } from './queries/event-names.query';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export interface FunnelCacheEntry {
  data: FunnelQueryResult;
  cached_at: string;
  from_cache: boolean;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
  ) {}

  async getFunnel(
    userId: string,
    params: FunnelQueryParams & { widget_id?: string; force?: boolean },
  ): Promise<FunnelCacheEntry> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, ...queryParams } = params;
    const cacheKey = this.buildCacheKey(widget_id, queryParams);

    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey, widgetId: widget_id }, 'Funnel cache hit');
        const entry = JSON.parse(cached) as { data: FunnelQueryResult; cached_at: string };
        return { ...entry, from_cache: true };
      }
    }

    this.logger.debug({ projectId: params.project_id, steps: params.steps.length, force }, 'Funnel ClickHouse query');
    const data = await queryFunnel(this.ch, queryParams);
    const cached_at = new Date().toISOString();

    await this.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', CACHE_TTL_SECONDS);

    return { data, cached_at, from_cache: false };
  }

  async getEvents(userId: string, params: EventsQueryParams): Promise<EventRow[]> {
    await this.projectsService.getMembership(userId, params.project_id);
    return queryEvents(this.ch, params);
  }

  async getEventNames(userId: string, projectId: string): Promise<string[]> {
    await this.projectsService.getMembership(userId, projectId);
    const cacheKey = `event_names:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];
    const names = await queryEventNames(this.ch, { project_id: projectId });
    await this.redis.set(cacheKey, JSON.stringify(names), 'EX', 3600);
    return names;
  }

  private buildCacheKey(widgetId: string | undefined, params: FunnelQueryParams): string {
    const configHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
    return widgetId
      ? `funnel_result:${widgetId}:${configHash}`
      : `funnel_result:anonymous:${configHash}`;
  }
}
