import { Module, HttpStatus } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EventsModule } from '../events/events.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { PersonsModule } from '../persons/persons.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { SavedInsightsModule } from '../saved-insights/saved-insights.module';
import { MembersModule } from '../members/members.module';
import { AiModule } from '../ai/ai.module';
import { VerificationModule } from '../verification/verification.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { WebAnalyticsModule } from '../web-analytics/web-analytics.module';
import { BillingModule } from '../billing/billing.module';
import { IngestionWarningsModule } from '../ingestion-warnings/ingestion-warnings.module';
import { DemoModule } from '../demo/demo.module';
import { AiMonitorsModule } from '../ai-monitors/ai-monitors.module';
import { AiInsightsModule } from '../ai-insights/ai-insights.module';
import { AiScheduledJobsModule } from '../ai-scheduled-jobs/ai-scheduled-jobs.module';
import { AnnotationsModule } from '../annotations/annotations.module';
import { ShareTokensModule } from '../share-tokens/share-tokens.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { AuthController } from './controllers/auth.controller';
import { ProjectsController } from './controllers/projects.controller';
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
import { AiController } from './controllers/ai.controller';
import { EventDefinitionsController } from './controllers/event-definitions.controller';
import { PropertyDefinitionsController } from './controllers/property-definitions.controller';
import { WebAnalyticsController } from './controllers/web-analytics.controller';
import { BillingController } from './controllers/billing.controller';
import { IngestionWarningsController } from './controllers/ingestion-warnings.controller';
import { DemoController } from './controllers/demo.controller';
import { AiMonitorsController } from './controllers/ai-monitors.controller';
import { AiInsightsController } from './controllers/ai-insights.controller';
import { AiScheduledJobsController } from './controllers/ai-scheduled-jobs.controller';
import { AnnotationsController } from './controllers/annotations.controller';
import { PublicController } from './controllers/public.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { AdminStatsController } from './controllers/admin-stats.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminProjectsController } from './controllers/admin-projects.controller';
import { AdminPlansController } from './controllers/admin-plans.controller';
import { createHttpFilter } from './filters/create-http-filter';
import { TooManyRequestsFilter } from './filters/too-many-requests.filter';
import { VerificationCooldownFilter } from './filters/verification-cooldown.filter';
import { AppNotFoundException } from '../exceptions/app-not-found.exception';
import { AppConflictException } from '../exceptions/app-conflict.exception';
import { AppForbiddenException } from '../exceptions/app-forbidden.exception';
import { AppUnauthorizedException } from '../exceptions/app-unauthorized.exception';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { AiNotConfiguredException } from '../ai/exceptions/ai-not-configured.exception';
import { AiQuotaExceededException } from '../ai/exceptions/ai-quota-exceeded.exception';
import { AppUnprocessableEntityException } from '../exceptions/app-unprocessable-entity.exception';
import { CohortQueryValidationError } from '@qurvo/cohort-query';

const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
const ConflictFilter = createHttpFilter(HttpStatus.CONFLICT, AppConflictException);
const ForbiddenFilter = createHttpFilter(HttpStatus.FORBIDDEN, AppForbiddenException);
const UnauthorizedFilter = createHttpFilter(HttpStatus.UNAUTHORIZED, AppUnauthorizedException);
const BadRequestFilter = createHttpFilter(HttpStatus.BAD_REQUEST, AppBadRequestException, CohortQueryValidationError);
const AiNotConfiguredFilter = createHttpFilter(HttpStatus.NOT_IMPLEMENTED, AiNotConfiguredException);
const AiQuotaExceededFilter = createHttpFilter(HttpStatus.PAYMENT_REQUIRED, AiQuotaExceededException);
const UnprocessableEntityFilter = createHttpFilter(HttpStatus.UNPROCESSABLE_ENTITY, AppUnprocessableEntityException);

@Module({
  imports: [
    AuthModule,
    ProjectsModule,
    AnalyticsModule,
    EventsModule,
    DashboardsModule,
    PersonsModule,
    CohortsModule,
    SavedInsightsModule,
    MembersModule,
    AiModule,
    VerificationModule,
    DefinitionsModule,
    WebAnalyticsModule,
    BillingModule,
    IngestionWarningsModule,
    DemoModule,
    AiMonitorsModule,
    AiInsightsModule,
    AiScheduledJobsModule,
    AnnotationsModule,
    ShareTokensModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [
    AuthController,
    ProjectsController,
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
    AiController,
    EventDefinitionsController,
    PropertyDefinitionsController,
    WebAnalyticsController,
    BillingController,
    IngestionWarningsController,
    DemoController,
    AiMonitorsController,
    AiInsightsController,
    AiScheduledJobsController,
    AnnotationsController,
    PublicController,
    NotificationsController,
    AdminStatsController,
    AdminUsersController,
    AdminProjectsController,
    AdminPlansController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: NotFoundFilter },
    { provide: APP_FILTER, useClass: ConflictFilter },
    { provide: APP_FILTER, useClass: ForbiddenFilter },
    { provide: APP_FILTER, useClass: UnauthorizedFilter },
    { provide: APP_FILTER, useClass: BadRequestFilter },
    { provide: APP_FILTER, useClass: TooManyRequestsFilter },
    { provide: APP_FILTER, useClass: AiNotConfiguredFilter },
    { provide: APP_FILTER, useClass: AiQuotaExceededFilter },
    { provide: APP_FILTER, useClass: UnprocessableEntityFilter },
    { provide: APP_FILTER, useClass: VerificationCooldownFilter },
  ],
})
export class ApiModule {}
