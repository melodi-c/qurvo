import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CohortsService } from '../../cohorts/cohorts.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RequireRole } from '../decorators/require-role.decorator';
import {
  CreateCohortDto,
  UpdateCohortDto,
  CohortPreviewDto,
  CohortDto,
  CohortMemberCountDto,
  CohortSizeHistoryQueryDto,
  CohortHistoryPointDto,
} from '../dto/cohorts.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('Cohorts')
@ApiBearerAuth()
@Controller('api/projects/:projectId/cohorts')
@UseGuards(ProjectMemberGuard)
export class CohortsController {
  constructor(private readonly cohortsService: CohortsService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
  ): Promise<CohortDto[]> {
    return this.cohortsService.list(projectId) as any;
  }

  @RequireRole('editor')
  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateCohortDto,
  ): Promise<CohortDto> {
    return this.cohortsService.create(user.user_id, projectId, body) as any;
  }

  @Get(':cohortId')
  async getById(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<CohortDto> {
    return this.cohortsService.getById(projectId, cohortId) as any;
  }

  @RequireRole('editor')
  @Put(':cohortId')
  async update(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
    @Body() body: UpdateCohortDto,
  ): Promise<CohortDto> {
    return this.cohortsService.update(projectId, cohortId, body) as any;
  }

  @RequireRole('editor')
  @Delete(':cohortId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<void> {
    await this.cohortsService.remove(projectId, cohortId);
  }

  @Get(':cohortId/history')
  async getSizeHistory(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
    @Query() query: CohortSizeHistoryQueryDto,
  ): Promise<CohortHistoryPointDto[]> {
    return this.cohortsService.getSizeHistory(projectId, cohortId, query.days!) as any;
  }

  @Get(':cohortId/count')
  async getMemberCount(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<CohortMemberCountDto> {
    const count = await this.cohortsService.getMemberCount(projectId, cohortId);
    return { count };
  }

  @RequireRole('editor')
  @Post('preview-count')
  async previewCount(
    @Param('projectId') projectId: string,
    @Body() body: CohortPreviewDto,
  ): Promise<CohortMemberCountDto> {
    const count = await this.cohortsService.previewCount(projectId, body.definition);
    return { count };
  }
}
