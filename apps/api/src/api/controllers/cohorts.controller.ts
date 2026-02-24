import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CohortsService } from '../../cohorts/cohorts.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
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
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<CohortDto[]> {
    return this.cohortsService.list(user.user_id, projectId) as any;
  }

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
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
  ): Promise<CohortDto> {
    return this.cohortsService.getById(user.user_id, projectId, cohortId) as any;
  }

  @Put(':cohortId')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: UpdateCohortDto,
  ): Promise<CohortDto> {
    return this.cohortsService.update(user.user_id, projectId, cohortId, body) as any;
  }

  @Delete(':cohortId')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
  ): Promise<void> {
    await this.cohortsService.remove(user.user_id, projectId, cohortId);
  }

  @Get(':cohortId/history')
  async getSizeHistory(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Query() query: CohortSizeHistoryQueryDto,
  ): Promise<CohortHistoryPointDto[]> {
    return this.cohortsService.getSizeHistory(user.user_id, projectId, cohortId, query.days ?? 30) as any;
  }

  @Get(':cohortId/count')
  async getMemberCount(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
  ): Promise<CohortMemberCountDto> {
    const count = await this.cohortsService.getMemberCount(user.user_id, projectId, cohortId);
    return { count };
  }

  @Post('preview-count')
  async previewCount(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CohortPreviewDto,
  ): Promise<CohortMemberCountDto> {
    const count = await this.cohortsService.previewCount(user.user_id, projectId, body.definition);
    return { count };
  }
}
