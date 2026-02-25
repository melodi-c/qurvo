import {
  Controller, Post, Delete, Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaticCohortsService } from '../../cohorts/static-cohorts.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RequireRole } from '../decorators/require-role.decorator';
import {
  CohortDto,
  CreateStaticCohortDto,
  StaticCohortMembersDto,
  UploadCsvDto,
} from '../dto/cohorts.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('Cohorts')
@ApiBearerAuth()
@Controller('api/projects/:projectId/cohorts')
@UseGuards(ProjectMemberGuard)
export class StaticCohortsController {
  constructor(private readonly staticCohortsService: StaticCohortsService) {}

  @RequireRole('editor')
  @Post('static')
  async createStaticCohort(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateStaticCohortDto,
  ): Promise<CohortDto> {
    return this.staticCohortsService.createStaticCohort(user.user_id, projectId, body) as any;
  }

  @RequireRole('editor')
  @Post(':cohortId/duplicate-static')
  async duplicateAsStatic(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<CohortDto> {
    return this.staticCohortsService.duplicateAsStatic(user.user_id, projectId, cohortId) as any;
  }

  @RequireRole('editor')
  @Post(':cohortId/upload-csv')
  async uploadCsv(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
    @Body() body: UploadCsvDto,
  ): Promise<{ imported: number; total_lines: number }> {
    return this.staticCohortsService.importStaticCohortCsv(projectId, cohortId, body.csv_content);
  }

  @RequireRole('editor')
  @Post(':cohortId/members')
  async addMembers(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
    @Body() body: StaticCohortMembersDto,
  ): Promise<void> {
    await this.staticCohortsService.addStaticMembers(projectId, cohortId, body.person_ids);
  }

  @RequireRole('editor')
  @Delete(':cohortId/members')
  async removeMembers(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
    @Body() body: StaticCohortMembersDto,
  ): Promise<void> {
    await this.staticCohortsService.removeStaticMembers(projectId, cohortId, body.person_ids);
  }
}
