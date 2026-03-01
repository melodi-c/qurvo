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
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
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

/** Input type for WebAnalyticsService methods — timezone is injected from DB, not provided by callers. */
type WebAnalyticsInput = Omit<WebAnalyticsQueryParams, 'timezone'> & { force?: boolean };

@Injectable()
export class WebAnalyticsService {
  private readonly logger = new Logger(WebAnalyticsService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async getOverview(params: WebAnalyticsInput): Promise<AnalyticsCacheResult<OverviewResult>> {
    return this.runQuery(params, 'wa:overview', queryOverview);
  }

  async getPaths(params: WebAnalyticsInput): Promise<AnalyticsCacheResult<PathsResult>> {
    return this.runQuery(params, 'wa:paths', queryTopPages);
  }

  async getSources(params: WebAnalyticsInput): Promise<AnalyticsCacheResult<SourcesResult>> {
    return this.runQuery(params, 'wa:sources', querySources);
  }

  async getDevices(params: WebAnalyticsInput): Promise<AnalyticsCacheResult<DevicesResult>> {
    return this.runQuery(params, 'wa:devices', queryDevices);
  }

  async getGeography(params: WebAnalyticsInput): Promise<AnalyticsCacheResult<GeographyResult>> {
    return this.runQuery(params, 'wa:geography', queryGeography);
  }

  private async runQuery<T>(
    params: WebAnalyticsInput,
    prefix: string,
    queryFn: (ch: ClickHouseClient, p: WebAnalyticsQueryParams) => Promise<T>,
  ): Promise<AnalyticsCacheResult<T>> {
    const { force, ...rest } = params;

    // Auto-inject project timezone from DB
    const [project] = await this.db
      .select({ timezone: projects.timezone })
      .from(projects)
      .where(eq(projects.id, params.project_id))
      .limit(1);
    if (!project) {
      throw new AppBadRequestException(`Project ${params.project_id} not found`);
    }
    const queryParams: WebAnalyticsQueryParams = { ...rest, timezone: project.timezone };

    return withAnalyticsCache({ prefix, redis: this.redis, ch: this.ch, force, params: queryParams, query: queryFn, logger: this.logger });
  }
}
