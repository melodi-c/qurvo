import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { AiToolsService } from './ai-tools.service';
import { AiContextService } from './ai-context.service';
import { ProjectsModule } from '../projects/projects.module';
import { TrendModule } from '../trend/trend.module';
import { FunnelModule } from '../funnel/funnel.module';
import { RetentionModule } from '../retention/retention.module';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { StickinessModule } from '../stickiness/stickiness.module';
import { EventsModule } from '../events/events.module';
import { PersonsModule } from '../persons/persons.module';
import { UnitEconomicsModule } from '../unit-economics/unit-economics.module';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { TrendTool } from './tools/trend.tool';
import { FunnelTool } from './tools/funnel.tool';
import { RetentionTool } from './tools/retention.tool';
import { LifecycleTool } from './tools/lifecycle.tool';
import { StickinessTool } from './tools/stickiness.tool';
import { UnitEconomicsTool } from './tools/unit-economics.tool';
import { ListEventNamesTool } from './tools/list-event-names.tool';

const TOOL_CLASSES = [
  TrendTool,
  FunnelTool,
  RetentionTool,
  LifecycleTool,
  StickinessTool,
  UnitEconomicsTool,
  ListEventNamesTool,
];

@Module({
  imports: [
    ProjectsModule,
    TrendModule,
    FunnelModule,
    RetentionModule,
    LifecycleModule,
    StickinessModule,
    EventsModule,
    PersonsModule,
    UnitEconomicsModule,
  ],
  providers: [
    AiService,
    AiChatService,
    AiToolsService,
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
