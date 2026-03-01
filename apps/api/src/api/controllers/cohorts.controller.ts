import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { InferSelectModel } from 'drizzle-orm';
import { cohorts } from '@qurvo/db';
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

type CohortRow = InferSelectModel<typeof cohorts>;

function mapCohortRow(row: CohortRow): CohortDto {
  return {
    id: row.id,
    project_id: row.project_id,
    created_by: row.created_by,
    name: row.name,
    description: row.description,
    definition: row.definition,
    is_static: row.is_static,
    errors_calculating: row.errors_calculating,
    last_error_at: row.last_error_at ? row.last_error_at.toISOString() : null,
    last_error_message: row.last_error_message,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

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
    const rows = await this.cohortsService.list(projectId);
    return rows.map((r) => mapCohortRow(r));
  }

  @RequireRole('editor')
  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateCohortDto,
  ): Promise<CohortDto> {
    const row = await this.cohortsService.create(user.user_id, projectId, body);
    return mapCohortRow(row);
  }

  @Get(':cohortId')
  async getById(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<CohortDto> {
    const row = await this.cohortsService.getById(projectId, cohortId);
    return mapCohortRow(row);
  }

  @RequireRole('editor')
  @Put(':cohortId')
  async update(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
    @Body() body: UpdateCohortDto,
  ): Promise<CohortDto> {
    const row = await this.cohortsService.update(projectId, cohortId, body);
    return mapCohortRow(row);
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
    return this.cohortsService.getSizeHistory(projectId, cohortId, query.days ?? 30) as any;
  }

  @Get(':cohortId/count')
  async getMemberCount(
    @Param('projectId') projectId: string,
    @Param('cohortId', ParseUUIDPipe) cohortId: string,
  ): Promise<CohortMemberCountDto> {
    const count = await this.cohortsService.getMemberCount(projectId, cohortId);
    return { count };
  }

  @Post('preview-count')
  @HttpCode(200)
  async previewCount(
    @Param('projectId') projectId: string,
    @Body() body: CohortPreviewDto,
  ): Promise<CohortMemberCountDto> {
    const count = await this.cohortsService.previewCount(projectId, body.definition);
    return { count };
  }
}
