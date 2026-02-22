import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { FunnelModule } from '../funnel/funnel.module';
import { TrendModule } from '../trend/trend.module';
import { RetentionModule } from '../retention/retention.module';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { StickinessModule } from '../stickiness/stickiness.module';
import { PathsModule } from '../paths/paths.module';
import { EventsModule } from '../events/events.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { PersonsModule } from '../persons/persons.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { InsightsModule } from '../insights/insights.module';
import { MembersModule } from '../members/members.module';
import { MarketingChannelsModule } from '../marketing-channels/marketing-channels.module';
import { AdSpendModule } from '../ad-spend/ad-spend.module';
import { UnitEconomicsModule } from '../unit-economics/unit-economics.module';
import { AiModule } from '../ai/ai.module';
import { VerificationModule } from '../verification/verification.module';
import { EventDefinitionsModule } from '../event-definitions/event-definitions.module';
import { AuthController } from './controllers/auth.controller';
import { ProjectsController } from './controllers/projects.controller';
import { ApiKeysController } from './controllers/api-keys.controller';
import { FunnelController } from './controllers/funnel.controller';
import { EventsController } from './controllers/events.controller';
import { TrendController } from './controllers/trend.controller';
import { RetentionController } from './controllers/retention.controller';
import { LifecycleController } from './controllers/lifecycle.controller';
import { StickinessController } from './controllers/stickiness.controller';
import { PathsController } from './controllers/paths.controller';
import { DashboardsController } from './controllers/dashboards.controller';
import { PersonsController } from './controllers/persons.controller';
import { CohortsController } from './controllers/cohorts.controller';
import { InsightsController } from './controllers/insights.controller';
import { MembersController, InvitesController, MyInvitesController } from './controllers/members.controller';
import { MarketingChannelsController } from './controllers/marketing-channels.controller';
import { AdSpendController } from './controllers/ad-spend.controller';
import { UnitEconomicsController, UnitEconomicsConfigController } from './controllers/unit-economics.controller';
import { AiController } from './controllers/ai.controller';
import { EventDefinitionsController } from './controllers/event-definitions.controller';
import { TooManyRequestsFilter } from './filters/too-many-requests.filter';
import { UnauthorizedFilter } from './filters/unauthorized.filter';
import { ForbiddenFilter } from './filters/forbidden.filter';
import { NotFoundFilter } from './filters/not-found.filter';
import { ConflictFilter } from './filters/conflict.filter';
import { AiNotConfiguredFilter } from './filters/ai-not-configured.filter';
import { VerificationFilter } from './filters/verification.filter';
import { WrongPasswordFilter } from './filters/wrong-password.filter';

@Module({
  imports: [AuthModule, ProjectsModule, ApiKeysModule, FunnelModule, TrendModule, RetentionModule, LifecycleModule, StickinessModule, PathsModule, EventsModule, DashboardsModule, PersonsModule, CohortsModule, InsightsModule, MembersModule, MarketingChannelsModule, AdSpendModule, UnitEconomicsModule, AiModule, VerificationModule, EventDefinitionsModule],
  controllers: [
    AuthController,
    ProjectsController,
    ApiKeysController,
    FunnelController,
    EventsController,
    TrendController,
    RetentionController,
    LifecycleController,
    StickinessController,
    PathsController,
    DashboardsController,
    PersonsController,
    CohortsController,
    InsightsController,
    MembersController,
    InvitesController,
    MyInvitesController,
    MarketingChannelsController,
    AdSpendController,
    UnitEconomicsController,
    UnitEconomicsConfigController,
    AiController,
    EventDefinitionsController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: TooManyRequestsFilter },
    { provide: APP_FILTER, useClass: UnauthorizedFilter },
    { provide: APP_FILTER, useClass: ForbiddenFilter },
    { provide: APP_FILTER, useClass: NotFoundFilter },
    { provide: APP_FILTER, useClass: ConflictFilter },
    { provide: APP_FILTER, useClass: AiNotConfiguredFilter },
    { provide: APP_FILTER, useClass: VerificationFilter },
    { provide: APP_FILTER, useClass: WrongPasswordFilter },
  ],
})
export class ApiModule {}
