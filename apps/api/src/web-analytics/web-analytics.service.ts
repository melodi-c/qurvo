import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import {
  queryOverview,
  queryPaths,
  querySources,
  queryDevices,
  queryGeography,
  type WebAnalyticsQueryParams,
  type OverviewResult,
  type PathsResult,
  type SourcesResult,
  type DevicesResult,
  type GeographyResult,
} from './web-analytics.query';

import { ANALYTICS_CACHE_TTL_SECONDS } from '../constants';

@Injectable()
export class WebAnalyticsService {
  private readonly logger = new Logger(WebAnalyticsService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
  ) {}

  async getOverview(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<OverviewResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    return this.cached('wa:overview', params, () => queryOverview(this.ch, params));
  }

  async getPaths(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<PathsResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    return this.cached('wa:paths', params, () => queryPaths(this.ch, params));
  }

  async getSources(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<SourcesResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    return this.cached('wa:sources', params, () => querySources(this.ch, params));
  }

  async getDevices(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<DevicesResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    return this.cached('wa:devices', params, () => queryDevices(this.ch, params));
  }

  async getGeography(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<GeographyResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    return this.cached('wa:geography', params, () => queryGeography(this.ch, params));
  }

  private async cached<T>(
    prefix: string,
    params: WebAnalyticsQueryParams & { force?: boolean },
    queryFn: () => Promise<T>,
  ): Promise<T> {
    const { force, ...queryParams } = params;
    const cacheKey = this.buildCacheKey(prefix, queryParams);

    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey }, 'Web analytics cache hit');
        return JSON.parse(cached) as T;
      }
    }

    this.logger.debug({ prefix, projectId: params.project_id, force }, 'Web analytics ClickHouse query');
    const data = await queryFn();
    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', ANALYTICS_CACHE_TTL_SECONDS);
    return data;
  }

  private buildCacheKey(prefix: string, params: WebAnalyticsQueryParams): string {
    const hash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
    return `${prefix}:${hash}`;
  }
}
