import { Controller, Get, Query, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { PersonsService } from '../../persons/persons.service';
import { CohortsService } from '../../cohorts/cohorts.service';
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
  PersonsAtFunnelStepQueryDto,
  PersonsAtPointResponseDto,
} from '../dto/persons.dto';

@ApiTags('Persons')
@ApiBearerAuth()
@Controller('api/persons')
@UseGuards(ProjectMemberGuard)
export class PersonsController {
  constructor(
    private readonly personsService: PersonsService,
    private readonly cohortsService: CohortsService,
  ) {}

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
    // Resolve cohort_ids → cohort_filters (same pattern as analytics factory)
    const cohortFilters = query.cohort_ids?.length
      ? await this.cohortsService.resolveCohortFilters(query.project_id, query.cohort_ids)
      : undefined;

    return this.personsService.getPersonsAtFunnelStep({
      project_id: query.project_id,
      steps: query.steps,
      step: query.step,
      conversion_window_days: query.conversion_window_days,
      date_from: query.date_from,
      date_to: query.date_to,
      timezone: query.timezone ?? 'UTC',
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      cohort_filters: cohortFilters,
      funnel_order_type: query.funnel_order_type,
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
