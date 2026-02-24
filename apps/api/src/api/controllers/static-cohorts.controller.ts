import {
  Controller, Post, Delete, Body, Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaticCohortsService } from '../../cohorts/static-cohorts.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  CohortDto,
  CreateStaticCohortDto,
  StaticCohortMembersDto,
  UploadCsvDto,
} from '../dto/cohorts.dto';

@ApiTags('Cohorts')
@ApiBearerAuth()
@Controller('api/projects/:projectId/cohorts')
export class StaticCohortsController {
  constructor(private readonly staticCohortsService: StaticCohortsService) {}

  @Post('static')
  async createStaticCohort(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateStaticCohortDto,
  ): Promise<CohortDto> {
    return this.staticCohortsService.createStaticCohort(user.user_id, projectId, body) as any;
  }

  @Post(':cohortId/duplicate-static')
  async duplicateAsStatic(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
  ): Promise<CohortDto> {
    return this.staticCohortsService.duplicateAsStatic(user.user_id, projectId, cohortId) as any;
  }

  @Post(':cohortId/upload-csv')
  async uploadCsv(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: UploadCsvDto,
  ): Promise<{ imported: number; total_lines: number }> {
    return this.staticCohortsService.importStaticCohortCsv(user.user_id, projectId, cohortId, body.csv_content);
  }

  @Post(':cohortId/members')
  async addMembers(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: StaticCohortMembersDto,
  ): Promise<void> {
    await this.staticCohortsService.addStaticMembers(user.user_id, projectId, cohortId, body.person_ids);
  }

  @Delete(':cohortId/members')
  async removeMembers(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: StaticCohortMembersDto,
  ): Promise<void> {
    await this.staticCohortsService.removeStaticMembers(user.user_id, projectId, cohortId, body.person_ids);
  }
}
