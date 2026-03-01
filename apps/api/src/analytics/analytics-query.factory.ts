import { Logger } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import type { Database } from '@qurvo/db';
import { projects } from '@qurvo/db';
import { eq } from 'drizzle-orm';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CohortsService } from '../cohorts/cohorts.service';
import { withAnalyticsCache, type AnalyticsCacheResult } from './with-analytics-cache';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { resolveRelativeDate, isRelativeDate } from './query-helpers/time';

export interface AnalyticsQueryService<TParams, TResult> {
  query(
    params: Omit<TParams, 'cohort_filters' | 'breakdown_cohort_ids' | 'timezone'> & {
      widget_id?: string;
      force?: boolean;
      cohort_ids?: string[];
      breakdown_type?: 'property' | 'cohort';
      breakdown_cohort_ids?: string[];
    },
  ): Promise<AnalyticsCacheResult<TResult>>;
}

export function createAnalyticsQueryProvider<
  TParams extends { project_id: string; cohort_filters?: unknown; timezone: string },
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
      db: Database,
    ): AnalyticsQueryService<TParams, TResult> => {
      const logger = new Logger(prefix);

      return {
        async query(params) {
          const { widget_id, force, cohort_ids, breakdown_type, breakdown_cohort_ids, ...queryParams } = params;
          const mutableParams = queryParams as Record<string, unknown>;

          // Auto-inject project timezone from DB
          const [project] = await db
            .select({ timezone: projects.timezone })
            .from(projects)
            .where(eq(projects.id, params.project_id))
            .limit(1);
          if (!project) {
            throw new AppBadRequestException(`Project ${params.project_id} not found`);
          }
          mutableParams.timezone = project.timezone;

          // Resolve relative date strings (e.g. '-7d', 'mStart') to absolute YYYY-MM-DD.
          // Must happen AFTER timezone injection so resolution uses project timezone.
          const tz = mutableParams.timezone as string | undefined;
          if (typeof mutableParams.date_from === 'string' && isRelativeDate(mutableParams.date_from)) {
            mutableParams.date_from = resolveRelativeDate(mutableParams.date_from, tz);
          }
          if (typeof mutableParams.date_to === 'string' && isRelativeDate(mutableParams.date_to)) {
            mutableParams.date_to = resolveRelativeDate(mutableParams.date_to, tz);
          }

          if (cohort_ids?.length) {
            // Merge resolved cohort_ids filters with any directly-passed cohort_filters.
            // Both sources are applied with AND semantics: a person must satisfy all
            // active cohort constraints to be included in the query result.
            const resolved = await cohortsService.resolveCohortFilters(params.project_id, cohort_ids);
            const existing = (mutableParams.cohort_filters as unknown[] | undefined) ?? [];
            mutableParams.cohort_filters = [...existing, ...resolved];
          }

          if (breakdown_cohort_ids?.length && breakdown_type !== 'cohort') {
            throw new AppBadRequestException(
              "при передаче breakdown_cohort_ids поле breakdown_type должно быть равно 'cohort'",
            );
          }

          if (breakdown_type === 'cohort' && !breakdown_cohort_ids?.length) {
            throw new AppBadRequestException(
              "breakdown_cohort_ids must have at least one cohort when breakdown_type is 'cohort'",
            );
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
    inject: [CLICKHOUSE, REDIS, CohortsService, DRIZZLE],
  };
}
