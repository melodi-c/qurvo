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
  ],
  providers: [AiService, AiChatService, AiToolsService, AiContextService],
  exports: [AiService],
})
export class AiModule {}
