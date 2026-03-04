import { Controller, Get, Query, Param, UseGuards, ParseUUIDPipe, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { projects, type Database } from '@qurvo/db';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { PersonsService } from '../../persons/persons.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { resolveDateRange } from '../../analytics/query-helpers/time';
import {
  PersonsQueryDto,
  PersonsListResponseDto,
  PersonDto,
  PersonByIdQueryDto,
  PersonEventsQueryDto,
  PersonEventRowDto,
  PersonPropertyNamesQueryDto,
  PersonPropertyNamesResponseDto,
  PersonCohortsResponseDto,
  PersonsAtPointResponseDto,
  PersonsAtLifecycleBucketQueryDto,
  PersonsAtRetentionCellQueryDto,
  PersonsAtFunnelStepQueryDto,
  PersonsAtTrendBucketQueryDto,
  PersonsAtStickinessBarQueryDto,
} from '../dto/persons.dto';
import type { PropertyFilter } from '../../analytics/query-helpers';

@ApiTags('Persons')
@ApiBearerAuth()
@Controller('api/persons')
@UseGuards(ProjectMemberGuard)
export class PersonsController {
  constructor(
    private readonly personsService: PersonsService,
    private readonly cohortsService: CohortsService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  private async resolveProjectTimezone(projectId: string): Promise<string> {
    const [project] = await this.db
      .select({ timezone: projects.timezone })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      throw new AppBadRequestException(`Project ${projectId} not found`);
    }
    return project.timezone;
  }

  @Get()
  async getPersons(
    @Query() query: PersonsQueryDto,
  ): Promise<PersonsListResponseDto> {
    return this.personsService.getPersons(query) as any;
  }

  @Get('at-funnel-step')
  async getPersonsAtFunnelStep(
    @Query() query: PersonsAtFunnelStepQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    const timezone = query.timezone ?? (await this.resolveProjectTimezone(query.project_id));
    const { dateFrom, dateTo } = resolveDateRange(query.date_from, query.date_to, timezone);
    const cohortFilters = query.cohort_ids?.length
      ? await this.cohortsService.resolveCohortFilters(query.project_id, query.cohort_ids)
      : undefined;

    return this.personsService.getPersonsAtFunnelStep({
      project_id: query.project_id,
      steps: query.steps,
      step: query.step,
      conversion_window_days: query.conversion_window_days,
      date_from: dateFrom,
      date_to: dateTo,
      timezone,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      cohort_filters: cohortFilters,
      funnel_order_type: query.funnel_order_type,
    }) as any;
  }

  @Get('at-trend-bucket')
  async getPersonsAtTrendBucket(
    @Query() query: PersonsAtTrendBucketQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    const timezone = await this.resolveProjectTimezone(query.project_id);
    const { dateFrom, dateTo } = resolveDateRange(query.date_from, query.date_to, timezone);
    return this.personsService.getPersonsAtTrendBucket({
      project_id: query.project_id,
      event_name: query.event_name,
      granularity: query.granularity,
      bucket: query.bucket,
      date_from: dateFrom,
      date_to: dateTo,
      filters: query.filters,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }) as any;
  }

  @Get('at-stickiness-bar')
  async getPersonsAtStickinessBar(
    @Query() query: PersonsAtStickinessBarQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    const timezone = await this.resolveProjectTimezone(query.project_id);
    const { dateFrom, dateTo } = resolveDateRange(query.date_from, query.date_to, timezone);
    return this.personsService.getPersonsAtStickinessBar({
      project_id: query.project_id,
      event_name: query.event_name,
      granularity: query.granularity,
      period_count: query.period_count,
      date_from: dateFrom,
      date_to: dateTo,
      filters: query.filters,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }) as any;
  }

  @Get('property-names')
  async getPersonPropertyNames(
    @Query() query: PersonPropertyNamesQueryDto,
  ): Promise<PersonPropertyNamesResponseDto> {
    const property_names = await this.personsService.getPersonPropertyNames(
      query.project_id,
    );
    return { property_names } as any;
  }

  @Get('at-lifecycle-bucket')
  async getPersonsAtLifecycleBucket(
    @Query() query: PersonsAtLifecycleBucketQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    const timezone = await this.resolveProjectTimezone(query.project_id);
    const { dateFrom, dateTo } = resolveDateRange(query.date_from, query.date_to, timezone);
    const cohortFilters = query.cohort_ids?.length
      ? await this.cohortsService.resolveCohortFilters(query.project_id, query.cohort_ids)
      : undefined;
    return this.personsService.getPersonsAtLifecycleBucket({
      project_id: query.project_id,
      target_event: query.target_event,
      granularity: query.granularity,
      date_from: dateFrom,
      date_to: dateTo,
      bucket: query.bucket,
      status: query.status,
      filters: query.filters as PropertyFilter[] | undefined,
      cohort_filters: cohortFilters,
      timezone,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }) as any;
  }

  @Get('at-retention-cell')
  async getPersonsAtRetentionCell(
    @Query() query: PersonsAtRetentionCellQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    const timezone = await this.resolveProjectTimezone(query.project_id);
    const { dateFrom, dateTo } = resolveDateRange(query.date_from, query.date_to, timezone);
    const cohortFilters = query.cohort_ids?.length
      ? await this.cohortsService.resolveCohortFilters(query.project_id, query.cohort_ids)
      : undefined;
    return this.personsService.getPersonsAtRetentionCell({
      project_id: query.project_id,
      target_event: query.target_event,
      return_event: query.return_event,
      retention_type: query.retention_type,
      granularity: query.granularity,
      periods: query.periods,
      date_from: dateFrom,
      date_to: dateTo,
      cohort_date: query.cohort_date,
      period_offset: query.period_offset,
      filters: query.filters as PropertyFilter[] | undefined,
      cohort_filters: cohortFilters,
      timezone,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }) as any;
  }

  @Get(':personId')
  async getPersonById(
    @Query() query: PersonByIdQueryDto,
    @Param('personId', ParseUUIDPipe) personId: string,
  ): Promise<PersonDto> {
    return this.personsService.getPersonById(query.project_id, personId) as any;
  }

  @Get(':personId/events')
  async getPersonEvents(
    @Query() query: PersonEventsQueryDto,
    @Param('personId', ParseUUIDPipe) personId: string,
  ): Promise<PersonEventRowDto[]> {
    return this.personsService.getPersonEvents({
      project_id: query.project_id,
      person_id: personId,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }) as any;
  }

  @Get(':personId/cohorts')
  async getPersonCohorts(
    @Query() query: PersonByIdQueryDto,
    @Param('personId', ParseUUIDPipe) personId: string,
  ): Promise<PersonCohortsResponseDto> {
    const cohorts = await this.personsService.getPersonCohorts(
      query.project_id,
      personId,
    );
    return { cohorts } as any;
  }
}
