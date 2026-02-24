import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { AiContextService } from './ai-context.service';
import { ProjectsModule } from '../projects/projects.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EventsModule } from '../events/events.module';
import { PersonsModule } from '../persons/persons.module';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { TrendTool } from './tools/trend.tool';
import { FunnelTool } from './tools/funnel.tool';
import { RetentionTool } from './tools/retention.tool';
import { LifecycleTool } from './tools/lifecycle.tool';
import { StickinessTool } from './tools/stickiness.tool';
import { ListEventNamesTool } from './tools/list-event-names.tool';
import { PathsTool } from './tools/paths.tool';

const TOOL_CLASSES = [
  TrendTool,
  FunnelTool,
  RetentionTool,
  LifecycleTool,
  StickinessTool,
  ListEventNamesTool,
  PathsTool,
];

@Module({
  imports: [
    ProjectsModule,
    AnalyticsModule,
    EventsModule,
    PersonsModule,
  ],
  providers: [
    AiService,
    AiChatService,
    AiContextService,
    ...TOOL_CLASSES,
    {
      provide: AI_TOOLS,
      useFactory: (...tools: AiTool[]) => tools,
      inject: TOOL_CLASSES,
    },
  ],
  exports: [AiService],
})
export class AiModule {}
