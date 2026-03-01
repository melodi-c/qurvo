import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { projects } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { withAnalyticsCache, type AnalyticsCacheResult } from '../analytics/with-analytics-cache';
import {
  queryOverview,
  queryTopPages,
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
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async getOverview(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<AnalyticsCacheResult<OverviewResult>> {
    return this.runQuery(params, 'wa:overview', queryOverview);
  }

  async getPaths(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<AnalyticsCacheResult<PathsResult>> {
    return this.runQuery(params, 'wa:paths', queryTopPages);
  }

  async getSources(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<AnalyticsCacheResult<SourcesResult>> {
    return this.runQuery(params, 'wa:sources', querySources);
  }

  async getDevices(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<AnalyticsCacheResult<DevicesResult>> {
    return this.runQuery(params, 'wa:devices', queryDevices);
  }

  async getGeography(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<AnalyticsCacheResult<GeographyResult>> {
    return this.runQuery(params, 'wa:geography', queryGeography);
  }

  private async runQuery<T>(
    params: WebAnalyticsQueryParams & { force?: boolean },
    prefix: string,
    queryFn: (ch: ClickHouseClient, p: WebAnalyticsQueryParams) => Promise<T>,
  ): Promise<AnalyticsCacheResult<T>> {
    const { force, ...queryParams } = params;

    // Auto-inject project timezone from DB
    const [project] = await this.db
      .select({ timezone: projects.timezone })
      .from(projects)
      .where(eq(projects.id, params.project_id))
      .limit(1);
    if (project) {
      queryParams.timezone = project.timezone;
    }

    return withAnalyticsCache({ prefix, redis: this.redis, ch: this.ch, force, params: queryParams, query: queryFn, logger: this.logger });
  }
}
