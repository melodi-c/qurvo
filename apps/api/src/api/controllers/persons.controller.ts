import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PersonsService } from '../../persons/persons.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  PersonsQueryDto,
  PersonsListResponseDto,
  PersonDto,
  PersonEventsQueryDto,
  PersonEventRowDto,
  PersonPropertyNamesQueryDto,
  PersonPropertyNamesResponseDto,
} from '../dto/persons.dto';
import type { PersonRow } from '../../persons/persons.query';

function toPersonDto(p: PersonRow): PersonDto {
  return {
    id: p.id,
    project_id: p.project_id,
    properties: p.properties,
    distinct_ids: p.distinct_ids ?? [],
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

@ApiTags('Persons')
@ApiBearerAuth()
@Controller('api/persons')
@UseGuards(SessionAuthGuard)
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  async getPersons(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonsQueryDto,
  ): Promise<PersonsListResponseDto> {
    const { persons, total } = await this.personsService.getPersons(user.user_id, {
      project_id: query.project_id,
      search: query.search,
      filters: query.filters,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });

    return { persons: persons.map(toPersonDto), total };
  }

  @Get('property-names')
  async getPersonPropertyNames(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonPropertyNamesQueryDto,
  ): Promise<PersonPropertyNamesResponseDto> {
    const property_names = await this.personsService.getPersonPropertyNames(
      user.user_id,
      query.project_id,
    );
    return { property_names } as any;
  }

  @Get(':personId')
  async getPersonById(
    @CurrentUser() user: RequestUser,
    @Query('project_id') projectId: string,
    @Param('personId') personId: string,
  ): Promise<PersonDto> {
    const person = await this.personsService.getPersonById(user.user_id, projectId, personId);
    return toPersonDto(person);
  }

  @Get(':personId/events')
  async getPersonEvents(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonEventsQueryDto,
    @Param('personId') personId: string,
  ): Promise<PersonEventRowDto[]> {
    return this.personsService.getPersonEvents(user.user_id, {
      project_id: query.project_id,
      person_id: personId,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }
}
