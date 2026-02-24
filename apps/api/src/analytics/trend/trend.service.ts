import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import { REDIS } from '../../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../../projects/projects.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { withAnalyticsCache, type AnalyticsCacheResult } from '../with-analytics-cache';
import { queryTrend, type TrendQueryParams, type TrendQueryResult } from './trend.query';

@Injectable()
export class TrendService {
  private readonly logger = new Logger(TrendService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
    private readonly cohortsService: CohortsService,
  ) {}

  async getTrend(
    userId: string,
    params: Omit<TrendQueryParams, 'cohort_filters' | 'breakdown_cohort_ids'> & {
      widget_id?: string;
      force?: boolean;
      cohort_ids?: string[];
      breakdown_type?: 'property' | 'cohort';
      breakdown_cohort_ids?: string[];
    },
  ): Promise<AnalyticsCacheResult<TrendQueryResult>> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, breakdown_type, breakdown_cohort_ids, ...rest } = params;
    const queryParams: TrendQueryParams = { ...rest };

    if (cohort_ids?.length) {
      queryParams.cohort_filters = await this.cohortsService.resolveCohortFilters(
        userId, params.project_id, cohort_ids,
      );
    }

    if (breakdown_type === 'cohort' && breakdown_cohort_ids?.length) {
      queryParams.breakdown_cohort_ids = await this.cohortsService.resolveCohortBreakdowns(
        userId, params.project_id, breakdown_cohort_ids,
      );
    }

    return withAnalyticsCache({
      prefix: 'trend',
      redis: this.redis,
      ch: this.ch,
      widgetId: widget_id,
      force,
      params: queryParams,
      query: queryTrend,
      logger: this.logger,
    });
  }
}
