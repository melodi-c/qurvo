import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { TrendService } from './trend/trend.service';
import { FunnelService } from './funnel/funnel.service';
import { RetentionService } from './retention/retention.service';
import { LifecycleService } from './lifecycle/lifecycle.service';
import { StickinessService } from './stickiness/stickiness.service';
import { PathsService } from './paths/paths.service';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [
    TrendService,
    FunnelService,
    RetentionService,
    LifecycleService,
    StickinessService,
    PathsService,
  ],
  exports: [
    TrendService,
    FunnelService,
    RetentionService,
    LifecycleService,
    StickinessService,
    PathsService,
  ],
})
export class AnalyticsModule {}
