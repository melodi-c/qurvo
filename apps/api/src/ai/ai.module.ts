import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { AiFeedbackService } from './ai-feedback.service';
import { AiContextService } from './ai-context.service';
import { AiSummarizationService } from './ai-summarization.service';
import { AiMessageHistoryBuilder } from './ai-message-history';
import { AiToolDispatcher } from './ai-tool-dispatcher';
import { AiRateLimitGuard } from './guards/ai-rate-limit.guard';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { AI_CONFIG } from './ai-config.provider';
import type { AiConfig } from './ai-config.provider';
import { ProjectsModule } from '../projects/projects.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EventsModule } from '../events/events.module';
import { PersonsModule } from '../persons/persons.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { SavedInsightsModule } from '../saved-insights/saved-insights.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { TrendTool } from './tools/trend.tool';
import { FunnelTool } from './tools/funnel.tool';
import { RetentionTool } from './tools/retention.tool';
import { LifecycleTool } from './tools/lifecycle.tool';
import { StickinessTool } from './tools/stickiness.tool';
import { ListEventNamesTool } from './tools/list-event-names.tool';
import { ListPropertyValuesTool } from './tools/list-property-values.tool';
import { PathsTool } from './tools/paths.tool';
import { QueryCohortMembersTool } from './tools/query-cohort-members.tool';
import { QueryPersonsTool } from './tools/query-persons.tool';
import { CreateInsightTool } from './tools/create-insight.tool';
import { ListDashboardsTool } from './tools/list-dashboards.tool';
import { SaveToDashboardTool } from './tools/save-to-dashboard.tool';
import { FunnelGapsTool } from './tools/funnel-gaps.tool';
import { MetricChangeTool } from './tools/metric-change.tool';

const TOOL_CLASSES = [
  TrendTool,
  FunnelTool,
  RetentionTool,
  LifecycleTool,
  StickinessTool,
  ListEventNamesTool,
  ListPropertyValuesTool,
  PathsTool,
  QueryCohortMembersTool,
  QueryPersonsTool,
  CreateInsightTool,
  ListDashboardsTool,
  SaveToDashboardTool,
  FunnelGapsTool,
  MetricChangeTool,
];

@Module({
  imports: [
    ProjectsModule,
    AnalyticsModule,
    EventsModule,
    PersonsModule,
    CohortsModule,
    SavedInsightsModule,
    DashboardsModule,
  ],
  providers: [
    AiService,
    AiChatService,
    AiFeedbackService,
    AiContextService,
    AiSummarizationService,
    AiMessageHistoryBuilder,
    AiToolDispatcher,
    AiRateLimitGuard,
    AiQuotaGuard,
    {
      provide: AI_CONFIG,
      useFactory: (): AiConfig => ({
        apiKey: process.env.OPENAI_API_KEY ?? null,
        model: process.env.OPENAI_MODEL ?? 'gpt-4o',
        baseURL: process.env.OPENAI_API_BASE_URL || undefined,
      }),
    },
    ...TOOL_CLASSES,
    {
      provide: AI_TOOLS,
      useFactory: (...tools: AiTool[]) => tools,
      inject: TOOL_CLASSES,
    },
  ],
  exports: [AiService, AiChatService, AiFeedbackService],
})
export class AiModule {}
