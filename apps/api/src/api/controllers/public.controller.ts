import { Controller, Get, Inject, Logger, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { ShareTokensService } from '../../share-tokens/share-tokens.service';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import {
  TREND_SERVICE,
  TREND_AGGREGATE_SERVICE,
  FUNNEL_SERVICE,
  RETENTION_SERVICE,
  LIFECYCLE_SERVICE,
  STICKINESS_SERVICE,
  PATHS_SERVICE,
} from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import { PublicDashboardWithDataDto } from '../dto/dashboards.dto';
import { InsightDto } from '../dto/insights.dto';

const AGGREGATE_CHART_TYPES = new Set(['world_map', 'calendar_heatmap']);

@ApiTags('Public')
@Public()
@Controller('api/public')
export class PublicController {
  private readonly logger = new Logger(PublicController.name);

  constructor(
    private readonly shareTokensService: ShareTokensService,
    private readonly dashboardsService: DashboardsService,
    private readonly savedInsightsService: SavedInsightsService,
    @Inject(TREND_SERVICE) private readonly trendService: AnalyticsQueryService<any, any>,
    @Inject(TREND_AGGREGATE_SERVICE) private readonly trendAggregateService: AnalyticsQueryService<any, any>,
    @Inject(FUNNEL_SERVICE) private readonly funnelService: AnalyticsQueryService<any, any>,
    @Inject(RETENTION_SERVICE) private readonly retentionService: AnalyticsQueryService<any, any>,
    @Inject(LIFECYCLE_SERVICE) private readonly lifecycleService: AnalyticsQueryService<any, any>,
    @Inject(STICKINESS_SERVICE) private readonly stickinessService: AnalyticsQueryService<any, any>,
    @Inject(PATHS_SERVICE) private readonly pathsService: AnalyticsQueryService<any, any>,
  ) {}

  @Get('dashboards/:shareToken')
  async getPublicDashboard(
    @Param('shareToken') shareToken: string,
  ): Promise<PublicDashboardWithDataDto> {
    const token = await this.shareTokensService.findDashboardToken(shareToken);
    const dashboard = await this.dashboardsService.getById(token.project_id, token.resource_id);

    const widgetData: Record<string, { data: unknown; cached_at: string; from_cache: boolean } | null> = {};

    const widgetsWithInsight = dashboard.widgets.filter(
      (w): w is typeof w & { insight: NonNullable<typeof w.insight> } =>
        w.insight?.config !== undefined && w.insight?.config !== null,
    );

    const results = await Promise.allSettled(
      widgetsWithInsight.map(async (widget) => {
        const config = widget.insight.config as unknown as Record<string, unknown>;
        const configType = config.type as string;

        // Apply dashboard-level date overrides
        const effectiveConfig = applyDashboardDateOverrides(config, dashboard.date_from, dashboard.date_to);

        const queryParams = {
          project_id: token.project_id,
          ...effectiveConfig,
        };

        const result = await this.queryWidget(configType, queryParams);
        return { widgetId: widget.id, result };
      }),
    );

    for (const outcome of results) {
      if (outcome.status === 'fulfilled') {
        widgetData[outcome.value.widgetId] = outcome.value.result;
      } else {
        this.logger.warn({ error: outcome.reason }, 'Widget query failed');
      }
    }

    // Ensure widgets without insight or with failed queries get null
    for (const widget of dashboard.widgets) {
      if (!(widget.id in widgetData)) {
        widgetData[widget.id] = null;
      }
    }

    return { ...dashboard, widget_data: widgetData } as any;
  }

  @Get('insights/:shareToken')
  async getPublicInsight(
    @Param('shareToken') shareToken: string,
  ): Promise<InsightDto> {
    const token = await this.shareTokensService.findInsightToken(shareToken);
    return this.savedInsightsService.getById(token.project_id, token.resource_id) as any;
  }

  private async queryWidget(
    configType: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; cached_at: string; from_cache: boolean } | null> {
    try {
      switch (configType) {
        case 'trend': {
          const chartType = params.chart_type as string | undefined;
          if (chartType && AGGREGATE_CHART_TYPES.has(chartType)) {
            // Trend aggregate (world_map / calendar_heatmap)
            const aggParams = {
              project_id: params.project_id as string,
              aggregate_type: chartType,
              series: (params.series as unknown[])?.map((s: any) => ({
                event_name: s.event_name,
                label: s.label,
                filters: s.filters,
              })),
              date_from: params.date_from as string,
              date_to: params.date_to as string,
              cohort_ids: params.cohort_ids as string[] | undefined,
            };
            const result = await this.trendAggregateService.query(aggParams);
            return { data: { _aggregate: true, ...result.data }, cached_at: result.cached_at, from_cache: result.from_cache };
          }
          // Standard trend
          if (!Array.isArray(params.series) || params.series.length === 0) {return null;}
          const result = await this.trendService.query(params);
          return result;
        }

        case 'funnel': {
          if (!Array.isArray(params.steps) || params.steps.length === 0) {return null;}
          const result = await this.funnelService.query(params);
          return result;
        }

        case 'retention': {
          if (!params.target_event) {return null;}
          const result = await this.retentionService.query(params);
          return result;
        }

        case 'lifecycle': {
          if (!params.target_event) {return null;}
          const result = await this.lifecycleService.query(params);
          return result;
        }

        case 'stickiness': {
          if (!params.target_event) {return null;}
          const result = await this.stickinessService.query(params);
          return result;
        }

        case 'paths': {
          const result = await this.pathsService.query({
            ...params,
            step_limit: (params.step_limit as number) ?? 5,
          });
          return result;
        }

        default:
          this.logger.warn({ configType }, 'Unknown widget config type');
          return null;
      }
    } catch (error) {
      this.logger.warn({ error, configType }, 'Widget query error');
      return null;
    }
  }
}

function applyDashboardDateOverrides(
  config: Record<string, unknown>,
  dashboardDateFrom: string | null,
  dashboardDateTo: string | null,
): Record<string, unknown> {
  if (!dashboardDateFrom && !dashboardDateTo) {return config;}

  return {
    ...config,
    ...(config.date_from !== undefined && dashboardDateFrom && { date_from: dashboardDateFrom }),
    ...(config.date_to !== undefined && dashboardDateTo && { date_to: dashboardDateTo }),
  };
}
