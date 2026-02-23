import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { CohortsService } from '../cohorts/cohorts.service';
import { queryLifecycle, type LifecycleQueryParams, type LifecycleQueryResult } from './lifecycle.query';

const CACHE_TTL_SECONDS = 3600;

export interface LifecycleCacheEntry {
  data: LifecycleQueryResult;
  cached_at: string;
  from_cache: boolean;
}

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
    private readonly cohortsService: CohortsService,
  ) {}

  async getLifecycle(
    userId: string,
    params: LifecycleQueryParams & { widget_id?: string; force?: boolean; cohort_ids?: string[] },
  ): Promise<LifecycleCacheEntry> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, ...queryParams } = params;

    if (cohort_ids?.length) {
      const rows = await Promise.all(
        cohort_ids.map((id) => this.cohortsService.getById(userId, params.project_id, id)),
      );
      queryParams.cohort_filters = rows.map((c) => ({
        cohort_id: c.id,
        definition: c.definition,
        materialized: c.membership_version !== null,
        is_static: c.is_static,
      }));
    }

    const cacheKey = this.buildCacheKey(widget_id, queryParams);

    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey, widgetId: widget_id }, 'Lifecycle cache hit');
        const entry = JSON.parse(cached) as { data: LifecycleQueryResult; cached_at: string };
        return { ...entry, from_cache: true };
      }
    }

    this.logger.debug(
      { projectId: params.project_id, targetEvent: params.target_event, force },
      'Lifecycle ClickHouse query',
    );

    const data = await queryLifecycle(this.ch, queryParams);
    const cached_at = new Date().toISOString();

    await this.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', CACHE_TTL_SECONDS);

    return { data, cached_at, from_cache: false };
  }

  private buildCacheKey(widgetId: string | undefined, params: LifecycleQueryParams): string {
    const configHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
    return widgetId
      ? `lifecycle_result:${widgetId}:${configHash}`
      : `lifecycle_result:anonymous:${configHash}`;
  }
}
