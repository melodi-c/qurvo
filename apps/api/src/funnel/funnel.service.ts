import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { CohortsService } from '../cohorts/cohorts.service';
import { queryFunnel, type FunnelQueryParams, type FunnelQueryResult } from './funnel.query';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export interface FunnelCacheEntry {
  data: FunnelQueryResult;
  cached_at: string;
  from_cache: boolean;
}

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
    },
  ): Promise<FunnelCacheEntry> {
    await this.projectsService.getMembership(userId, params.project_id);

    const { widget_id, force, cohort_ids, breakdown_type, breakdown_cohort_ids, ...rest } = params;

    const queryParams: FunnelQueryParams = { ...rest };

    // Resolve cohort IDs to filter inputs (materialized or inline)
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

    // Resolve cohort breakdown IDs
    if (breakdown_type === 'cohort' && breakdown_cohort_ids?.length) {
      const cbRows = await Promise.all(
        breakdown_cohort_ids.map((id) => this.cohortsService.getById(userId, params.project_id, id)),
      );
      queryParams.breakdown_cohort_ids = cbRows.map((c) => ({
        cohort_id: c.id,
        name: c.name,
        is_static: c.is_static,
      }));
    }
    const cacheKey = this.buildCacheKey(widget_id, queryParams);

    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey, widgetId: widget_id }, 'Funnel cache hit');
        const entry = JSON.parse(cached) as { data: FunnelQueryResult; cached_at: string };
        return { ...entry, from_cache: true };
      }
    }

    this.logger.debug({ projectId: params.project_id, steps: params.steps.length, force }, 'Funnel ClickHouse query');
    const data = await queryFunnel(this.ch, queryParams);
    const cached_at = new Date().toISOString();

    await this.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', CACHE_TTL_SECONDS);

    return { data, cached_at, from_cache: false };
  }

  private buildCacheKey(widgetId: string | undefined, params: FunnelQueryParams): string {
    const configHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
    return widgetId
      ? `funnel_result:${widgetId}:${configHash}`
      : `funnel_result:anonymous:${configHash}`;
  }
}
