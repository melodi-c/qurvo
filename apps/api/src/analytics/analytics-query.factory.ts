import { Logger } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import { CohortsService } from '../cohorts/cohorts.service';
import { withAnalyticsCache, type AnalyticsCacheResult } from './with-analytics-cache';

export interface AnalyticsQueryService<TParams, TResult> {
  query(
    params: Omit<TParams, 'cohort_filters' | 'breakdown_cohort_ids'> & {
      widget_id?: string;
      force?: boolean;
      cohort_ids?: string[];
      breakdown_type?: 'property' | 'cohort';
      breakdown_cohort_ids?: string[];
    },
  ): Promise<AnalyticsCacheResult<TResult>>;
}

export function createAnalyticsQueryProvider<
  TParams extends { project_id: string; cohort_filters?: unknown },
  TResult,
>(
  token: symbol,
  prefix: string,
  queryFn: (ch: ClickHouseClient, params: TParams) => Promise<TResult>,
): Provider {
  return {
    provide: token,
    useFactory: (
      ch: ClickHouseClient,
      redis: Redis,
      cohortsService: CohortsService,
    ): AnalyticsQueryService<TParams, TResult> => {
      const logger = new Logger(prefix);

      return {
        async query(params) {
          const { widget_id, force, cohort_ids, breakdown_type, breakdown_cohort_ids, ...queryParams } = params;
          const mutableParams = queryParams as Record<string, unknown>;

          if (cohort_ids?.length) {
            // Merge resolved cohort_ids filters with any directly-passed cohort_filters.
            // Both sources are applied with AND semantics: a person must satisfy all
            // active cohort constraints to be included in the query result.
            const resolved = await cohortsService.resolveCohortFilters(params.project_id, cohort_ids);
            const existing = (mutableParams.cohort_filters as unknown[] | undefined) ?? [];
            mutableParams.cohort_filters = [...existing, ...resolved];
          }

          if (breakdown_type === 'cohort' && breakdown_cohort_ids?.length) {
            mutableParams.breakdown_cohort_ids =
              await cohortsService.resolveCohortBreakdowns(params.project_id, breakdown_cohort_ids);
          }

          return withAnalyticsCache({
            prefix,
            redis,
            ch,
            widgetId: widget_id,
            force,
            params: queryParams as TParams,
            query: queryFn,
            logger,
          });
        },
      };
    },
    inject: [CLICKHOUSE, REDIS, CohortsService],
  };
}
