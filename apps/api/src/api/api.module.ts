import { Module, HttpStatus } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EventsModule } from '../events/events.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { PersonsModule } from '../persons/persons.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { SavedInsightsModule } from '../saved-insights/saved-insights.module';
import { MembersModule } from '../members/members.module';
import { MarketingChannelsModule } from '../marketing-channels/marketing-channels.module';
import { AdSpendModule } from '../ad-spend/ad-spend.module';
import { AiModule } from '../ai/ai.module';
import { VerificationModule } from '../verification/verification.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { WebAnalyticsModule } from '../web-analytics/web-analytics.module';
import { BillingModule } from '../billing/billing.module';
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
import { StaticCohortsController } from './controllers/static-cohorts.controller';
import { SavedInsightsController } from './controllers/saved-insights.controller';
import { MembersController, InvitesController, MyInvitesController } from './controllers/members.controller';
import { MarketingChannelsController } from './controllers/marketing-channels.controller';
import { AdSpendController } from './controllers/ad-spend.controller';
import { AiController } from './controllers/ai.controller';
import { EventDefinitionsController } from './controllers/event-definitions.controller';
import { PropertyDefinitionsController } from './controllers/property-definitions.controller';
import { WebAnalyticsController } from './controllers/web-analytics.controller';
import { BillingController } from './controllers/billing.controller';
import { createHttpFilter } from './filters/create-http-filter';
import { VerificationCooldownFilter } from './filters/verification-cooldown.filter';
import { AppNotFoundException } from '../exceptions/app-not-found.exception';
import { AppConflictException } from '../exceptions/app-conflict.exception';
import { AppForbiddenException } from '../exceptions/app-forbidden.exception';
import { AppUnauthorizedException } from '../exceptions/app-unauthorized.exception';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { AiNotConfiguredException } from '../ai/exceptions/ai-not-configured.exception';
import { WrongPasswordException } from '../auth/exceptions/wrong-password.exception';
import { InvalidVerificationCodeException } from '../verification/exceptions/invalid-verification-code.exception';

const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
const ConflictFilter = createHttpFilter(HttpStatus.CONFLICT, AppConflictException);
const ForbiddenFilter = createHttpFilter(HttpStatus.FORBIDDEN, AppForbiddenException);
const UnauthorizedFilter = createHttpFilter(HttpStatus.UNAUTHORIZED, AppUnauthorizedException);
const TooManyRequestsFilter = createHttpFilter(HttpStatus.TOO_MANY_REQUESTS, TooManyRequestsException);
const AiNotConfiguredFilter = createHttpFilter(HttpStatus.NOT_IMPLEMENTED, AiNotConfiguredException);
const UnprocessableEntityFilter = createHttpFilter(HttpStatus.UNPROCESSABLE_ENTITY, WrongPasswordException, InvalidVerificationCodeException);

@Module({
  imports: [
    AuthModule,
    ProjectsModule,
    ApiKeysModule,
    AnalyticsModule,
    EventsModule,
    DashboardsModule,
    PersonsModule,
    CohortsModule,
    SavedInsightsModule,
    MembersModule,
    MarketingChannelsModule,
    AdSpendModule,
    AiModule,
    VerificationModule,
    DefinitionsModule,
    WebAnalyticsModule,
    BillingModule,
  ],
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
    StaticCohortsController,
    SavedInsightsController,
    MembersController,
    InvitesController,
    MyInvitesController,
    MarketingChannelsController,
    AdSpendController,
    AiController,
    EventDefinitionsController,
    PropertyDefinitionsController,
    WebAnalyticsController,
    BillingController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: NotFoundFilter },
    { provide: APP_FILTER, useClass: ConflictFilter },
    { provide: APP_FILTER, useClass: ForbiddenFilter },
    { provide: APP_FILTER, useClass: UnauthorizedFilter },
    { provide: APP_FILTER, useClass: TooManyRequestsFilter },
    { provide: APP_FILTER, useClass: AiNotConfiguredFilter },
    { provide: APP_FILTER, useClass: UnprocessableEntityFilter },
    { provide: APP_FILTER, useClass: VerificationCooldownFilter },
  ],
})
export class ApiModule {}
