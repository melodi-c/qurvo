import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { withAnalyticsCache } from '../analytics/with-analytics-cache';
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
    const { force, ...queryParams } = params;
    return (await withAnalyticsCache({ prefix: 'wa:overview', redis: this.redis, ch: this.ch, force, params: queryParams, query: queryOverview, logger: this.logger })).data;
  }

  async getPaths(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<PathsResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    const { force, ...queryParams } = params;
    return (await withAnalyticsCache({ prefix: 'wa:paths', redis: this.redis, ch: this.ch, force, params: queryParams, query: queryPaths, logger: this.logger })).data;
  }

  async getSources(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<SourcesResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    const { force, ...queryParams } = params;
    return (await withAnalyticsCache({ prefix: 'wa:sources', redis: this.redis, ch: this.ch, force, params: queryParams, query: querySources, logger: this.logger })).data;
  }

  async getDevices(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<DevicesResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    const { force, ...queryParams } = params;
    return (await withAnalyticsCache({ prefix: 'wa:devices', redis: this.redis, ch: this.ch, force, params: queryParams, query: queryDevices, logger: this.logger })).data;
  }

  async getGeography(userId: string, params: WebAnalyticsQueryParams & { force?: boolean }): Promise<GeographyResult> {
    await this.projectsService.getMembership(userId, params.project_id);
    const { force, ...queryParams } = params;
    return (await withAnalyticsCache({ prefix: 'wa:geography', redis: this.redis, ch: this.ch, force, params: queryParams, query: queryGeography, logger: this.logger })).data;
  }
}
