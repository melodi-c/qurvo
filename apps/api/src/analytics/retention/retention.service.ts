import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import { REDIS } from '../../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../../projects/projects.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { withAnalyticsCache, type AnalyticsCacheResult } from '../with-analytics-cache';
import { queryRetention, type RetentionQueryParams, type RetentionQueryResult } from './retention.query';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
    private readonly cohortsService: CohortsService,
  ) {}

  async getRetention(
    userId: string,
    params: RetentionQueryParams & { widget_id?: string; force?: boolean; cohort_ids?: string[] },
  ): Promise<AnalyticsCacheResult<RetentionQueryResult>> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, ...queryParams } = params;

    if (cohort_ids?.length) {
      queryParams.cohort_filters = await this.cohortsService.resolveCohortFilters(
        userId, params.project_id, cohort_ids,
      );
    }

    return withAnalyticsCache({
      prefix: 'retention',
      redis: this.redis,
      ch: this.ch,
      widgetId: widget_id,
      force,
      params: queryParams,
      query: queryRetention,
      logger: this.logger,
    });
  }
}
