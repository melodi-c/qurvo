import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { CohortsService } from '../cohorts/cohorts.service';
import { queryPaths, type PathsQueryParams, type PathsQueryResult } from './paths.query';

const CACHE_TTL_SECONDS = 3600;

export interface PathsCacheEntry {
  data: PathsQueryResult;
  cached_at: string;
  from_cache: boolean;
}

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
  ): Promise<PathsCacheEntry> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, ...queryParams } = params;

    // Resolve cohort IDs to definitions
    if (cohort_ids?.length) {
      const definitions = await Promise.all(
        cohort_ids.map((id) => this.cohortsService.getCohortDefinition(userId, params.project_id, id)),
      );
      queryParams.cohort_filters = definitions;
    }

    const cacheKey = this.buildCacheKey(widget_id, queryParams);

    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey, widgetId: widget_id }, 'Paths cache hit');
        const entry = JSON.parse(cached) as { data: PathsQueryResult; cached_at: string };
        return { ...entry, from_cache: true };
      }
    }

    this.logger.debug(
      { projectId: params.project_id, stepLimit: params.step_limit, force },
      'Paths ClickHouse query',
    );

    const data = await queryPaths(this.ch, queryParams);
    const cached_at = new Date().toISOString();

    await this.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', CACHE_TTL_SECONDS);

    return { data, cached_at, from_cache: false };
  }

  private buildCacheKey(widgetId: string | undefined, params: PathsQueryParams): string {
    const configHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
    return widgetId
      ? `paths_result:${widgetId}:${configHash}`
      : `paths_result:anonymous:${configHash}`;
  }
}
