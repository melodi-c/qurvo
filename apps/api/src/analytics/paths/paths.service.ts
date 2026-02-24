import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import { REDIS } from '../../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../../projects/projects.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { withAnalyticsCache, type AnalyticsCacheResult } from '../with-analytics-cache';
import { queryPaths, type PathsQueryParams, type PathsQueryResult } from './paths.query';

@Injectable()
export class PathsService {
  private readonly logger = new Logger(PathsService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
    private readonly cohortsService: CohortsService,
  ) {}

  async getPaths(
    userId: string,
    params: PathsQueryParams & { widget_id?: string; force?: boolean; cohort_ids?: string[] },
  ): Promise<AnalyticsCacheResult<PathsQueryResult>> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, ...queryParams } = params;

    if (cohort_ids?.length) {
      queryParams.cohort_filters = await this.cohortsService.resolveCohortFilters(
        userId, params.project_id, cohort_ids,
      );
    }

    return withAnalyticsCache({
      prefix: 'paths',
      redis: this.redis,
      ch: this.ch,
      widgetId: widget_id,
      force,
      params: queryParams,
      query: queryPaths,
      logger: this.logger,
    });
  }
}
