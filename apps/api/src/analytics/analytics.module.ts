import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { TrendService } from './trend/trend.service';
import { FunnelService } from './funnel/funnel.service';
import { createAnalyticsQueryProvider } from './analytics-query.factory';
import { queryRetention } from './retention/retention.query';
import { queryLifecycle } from './lifecycle/lifecycle.query';
import { queryStickiness } from './stickiness/stickiness.query';
import { queryPaths } from './paths/paths.query';

export const RETENTION_SERVICE = Symbol('RETENTION_SERVICE');
export const LIFECYCLE_SERVICE = Symbol('LIFECYCLE_SERVICE');
export const STICKINESS_SERVICE = Symbol('STICKINESS_SERVICE');
export const PATHS_SERVICE = Symbol('PATHS_SERVICE');

const retentionProvider = createAnalyticsQueryProvider(RETENTION_SERVICE, 'retention', queryRetention);
const lifecycleProvider = createAnalyticsQueryProvider(LIFECYCLE_SERVICE, 'lifecycle', queryLifecycle);
const stickinessProvider = createAnalyticsQueryProvider(STICKINESS_SERVICE, 'stickiness', queryStickiness);
const pathsProvider = createAnalyticsQueryProvider(PATHS_SERVICE, 'paths', queryPaths);

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [
    TrendService,
    FunnelService,
    retentionProvider,
    lifecycleProvider,
    stickinessProvider,
    pathsProvider,
  ],
  exports: [
    TrendService,
    FunnelService,
    RETENTION_SERVICE,
    LIFECYCLE_SERVICE,
    STICKINESS_SERVICE,
    PATHS_SERVICE,
  ],
})
export class AnalyticsModule {}
