import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { FunnelModule } from '../funnel/funnel.module';
import { TrendModule } from '../trend/trend.module';
import { RetentionModule } from '../retention/retention.module';
import { EventsModule } from '../events/events.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { PersonsModule } from '../persons/persons.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { InsightsModule } from '../insights/insights.module';
import { AuthController } from './controllers/auth.controller';
import { ProjectsController } from './controllers/projects.controller';
import { ApiKeysController } from './controllers/api-keys.controller';
import { AnalyticsController } from './controllers/analytics.controller';
import { DashboardsController } from './controllers/dashboards.controller';
import { PersonsController } from './controllers/persons.controller';
import { CohortsController } from './controllers/cohorts.controller';
import { InsightsController } from './controllers/insights.controller';
import { TooManyRequestsFilter } from './filters/too-many-requests.filter';
import { UnauthorizedFilter } from './filters/unauthorized.filter';
import { ForbiddenFilter } from './filters/forbidden.filter';
import { NotFoundFilter } from './filters/not-found.filter';
import { ConflictFilter } from './filters/conflict.filter';

@Module({
  imports: [AuthModule, ProjectsModule, ApiKeysModule, FunnelModule, TrendModule, RetentionModule, EventsModule, DashboardsModule, PersonsModule, CohortsModule, InsightsModule],
  controllers: [
    AuthController,
    ProjectsController,
    ApiKeysController,
    AnalyticsController,
    DashboardsController,
    PersonsController,
    CohortsController,
    InsightsController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: TooManyRequestsFilter },
    { provide: APP_FILTER, useClass: UnauthorizedFilter },
    { provide: APP_FILTER, useClass: ForbiddenFilter },
    { provide: APP_FILTER, useClass: NotFoundFilter },
    { provide: APP_FILTER, useClass: ConflictFilter },
  ],
})
export class ApiModule {}
