import { Controller, Get, Query, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { PersonsService } from '../../persons/persons.service';
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
  PersonsAtTrendBucketQueryDto,
  PersonsAtStickinessBarQueryDto,
  PersonsAtPointResponseDto,
} from '../dto/persons.dto';

@ApiTags('Persons')
@ApiBearerAuth()
@Controller('api/persons')
@UseGuards(ProjectMemberGuard)
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  async getPersons(
    @Query() query: PersonsQueryDto,
  ): Promise<PersonsListResponseDto> {
    return this.personsService.getPersons(query) as any;
  }

  @Get('at-trend-bucket')
  async getPersonsAtTrendBucket(
    @Query() query: PersonsAtTrendBucketQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    return this.personsService.getPersonsAtTrendBucket({
      project_id: query.project_id,
      event_name: query.event_name,
      granularity: query.granularity,
      bucket: query.bucket,
      date_from: query.date_from,
      date_to: query.date_to,
      filters: query.filters,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }) as any;
  }

  @Get('at-stickiness-bar')
  async getPersonsAtStickinessBar(
    @Query() query: PersonsAtStickinessBarQueryDto,
  ): Promise<PersonsAtPointResponseDto> {
    return this.personsService.getPersonsAtStickinessBar({
      project_id: query.project_id,
      event_name: query.event_name,
      granularity: query.granularity,
      period_count: query.period_count,
      date_from: query.date_from,
      date_to: query.date_to,
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
