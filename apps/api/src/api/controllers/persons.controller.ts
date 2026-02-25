import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
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
    return this.personsService.getPersons({
      ...query,
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
    @Param('personId') personId: string,
  ): Promise<PersonDto> {
    return this.personsService.getPersonById(query.project_id, personId) as any;
  }

  @Get(':personId/events')
  async getPersonEvents(
    @Query() query: PersonEventsQueryDto,
    @Param('personId') personId: string,
  ): Promise<PersonEventRowDto[]> {
    return this.personsService.getPersonEvents({
      project_id: query.project_id,
      person_id: personId,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }
}
