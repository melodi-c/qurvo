import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { withAnalyticsCache } from '../analytics/with-analytics-cache';
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
  ) {}

  async getOverview(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<OverviewResult> {
    return this.runQuery(params, 'wa:overview', queryOverview);
  }

  async getPaths(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<PathsResult> {
    return this.runQuery(params, 'wa:paths', queryTopPages);
  }

  async getSources(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<SourcesResult> {
    return this.runQuery(params, 'wa:sources', querySources);
  }

  async getDevices(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<DevicesResult> {
    return this.runQuery(params, 'wa:devices', queryDevices);
  }

  async getGeography(params: WebAnalyticsQueryParams & { force?: boolean }): Promise<GeographyResult> {
    return this.runQuery(params, 'wa:geography', queryGeography);
  }

  private async runQuery<T>(
    params: WebAnalyticsQueryParams & { force?: boolean },
    prefix: string,
    queryFn: (ch: ClickHouseClient, p: WebAnalyticsQueryParams) => Promise<T>,
  ): Promise<T> {
    const { force, ...queryParams } = params;
    return (await withAnalyticsCache({ prefix, redis: this.redis, ch: this.ch, force, params: queryParams, query: queryFn, logger: this.logger })).data;
  }
}
