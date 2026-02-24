import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import { REDIS } from '../../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../../projects/projects.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { withAnalyticsCache, type AnalyticsCacheResult } from '../with-analytics-cache';
import {
  queryFunnel,
  queryFunnelTimeToConvert,
  type FunnelQueryParams,
  type FunnelQueryResult,
  type TimeToConvertParams,
  type TimeToConvertResult,
} from './funnel.query';

@Injectable()
export class FunnelService {
  private readonly logger = new Logger(FunnelService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
    private readonly cohortsService: CohortsService,
  ) {}

  async getFunnel(
    userId: string,
    params: Omit<FunnelQueryParams, 'cohort_filters' | 'breakdown_cohort_ids'> & {
      widget_id?: string;
      force?: boolean;
      cohort_ids?: string[];
      breakdown_type?: 'property' | 'cohort';
      breakdown_cohort_ids?: string[];
      sampling_factor?: number;
    },
  ): Promise<AnalyticsCacheResult<FunnelQueryResult>> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, breakdown_type, breakdown_cohort_ids, ...rest } = params;
    const queryParams: FunnelQueryParams = { ...rest };

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
      prefix: 'funnel',
      redis: this.redis,
      ch: this.ch,
      widgetId: widget_id,
      force,
      params: queryParams,
      query: queryFunnel,
      logger: this.logger,
    });
  }

  async getFunnelTimeToConvert(
    userId: string,
    params: Omit<TimeToConvertParams, 'cohort_filters'> & {
      widget_id?: string;
      force?: boolean;
      cohort_ids?: string[];
    },
  ): Promise<AnalyticsCacheResult<TimeToConvertResult>> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, ...rest } = params;
    const queryParams: TimeToConvertParams = { ...rest };

    if (cohort_ids?.length) {
      queryParams.cohort_filters = await this.cohortsService.resolveCohortFilters(
        userId, params.project_id, cohort_ids,
      );
    }

    return withAnalyticsCache({
      prefix: 'ttc',
      redis: this.redis,
      ch: this.ch,
      widgetId: widget_id,
      force,
      params: queryParams,
      query: queryFunnelTimeToConvert,
      logger: this.logger,
    });
  }
}
