import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { createAnalyticsQueryProvider } from './analytics-query.factory';
import { queryTrend } from './trend/trend.query';
import { queryFunnel, queryFunnelTimeToConvert } from './funnel/funnel.query';
import { queryRetention } from './retention/retention.query';
import { queryLifecycle } from './lifecycle/lifecycle.query';
import { queryStickiness } from './stickiness/stickiness.query';
import { queryPaths } from './paths/paths.query';

export const TREND_SERVICE = Symbol('TREND_SERVICE');
export const FUNNEL_SERVICE = Symbol('FUNNEL_SERVICE');
export const FUNNEL_TTC_SERVICE = Symbol('FUNNEL_TTC_SERVICE');
export const RETENTION_SERVICE = Symbol('RETENTION_SERVICE');
export const LIFECYCLE_SERVICE = Symbol('LIFECYCLE_SERVICE');
export const STICKINESS_SERVICE = Symbol('STICKINESS_SERVICE');
export const PATHS_SERVICE = Symbol('PATHS_SERVICE');

const trendProvider = createAnalyticsQueryProvider(TREND_SERVICE, 'trend', queryTrend);
const funnelProvider = createAnalyticsQueryProvider(FUNNEL_SERVICE, 'funnel', queryFunnel);
const funnelTtcProvider = createAnalyticsQueryProvider(FUNNEL_TTC_SERVICE, 'ttc', queryFunnelTimeToConvert);
const retentionProvider = createAnalyticsQueryProvider(RETENTION_SERVICE, 'retention', queryRetention);
const lifecycleProvider = createAnalyticsQueryProvider(LIFECYCLE_SERVICE, 'lifecycle', queryLifecycle);
const stickinessProvider = createAnalyticsQueryProvider(STICKINESS_SERVICE, 'stickiness', queryStickiness);
const pathsProvider = createAnalyticsQueryProvider(PATHS_SERVICE, 'paths', queryPaths);

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [
    trendProvider,
    funnelProvider,
    funnelTtcProvider,
    retentionProvider,
    lifecycleProvider,
    stickinessProvider,
    pathsProvider,
  ],
  exports: [
    TREND_SERVICE,
    FUNNEL_SERVICE,
    FUNNEL_TTC_SERVICE,
    RETENTION_SERVICE,
    LIFECYCLE_SERVICE,
    STICKINESS_SERVICE,
    PATHS_SERVICE,
  ],
})
export class AnalyticsModule {}
