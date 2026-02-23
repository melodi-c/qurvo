import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CohortsService } from '../../cohorts/cohorts.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  CreateCohortDto,
  UpdateCohortDto,
  CohortPreviewDto,
  CohortDto,
  CohortMemberCountDto,
  CreateStaticCohortDto,
  StaticCohortMembersDto,
} from '../dto/cohorts.dto';

@ApiTags('Cohorts')
@ApiBearerAuth()
@Controller('api/projects/:projectId/cohorts')
@UseGuards(SessionAuthGuard)
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
    if (!body.definition) {
      return { count: 0 };
    }
    const count = await this.cohortsService.previewCount(user.user_id, projectId, body.definition);
    return { count };
  }

  // ── Static cohort endpoints ──────────────────────────────────────────────

  @Post('static')
  async createStaticCohort(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateStaticCohortDto,
  ): Promise<CohortDto> {
    return this.cohortsService.createStaticCohort(user.user_id, projectId, body) as any;
  }

  @Post(':cohortId/duplicate-static')
  async duplicateAsStatic(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
  ): Promise<CohortDto> {
    return this.cohortsService.duplicateAsStatic(user.user_id, projectId, cohortId) as any;
  }

  @Post(':cohortId/upload-csv')
  async uploadCsv(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: { csv_content: string },
  ) {
    return this.cohortsService.importStaticCohortCsv(user.user_id, projectId, cohortId, body.csv_content);
  }

  @Post(':cohortId/members')
  async addMembers(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: StaticCohortMembersDto,
  ): Promise<void> {
    await this.cohortsService.addStaticMembers(user.user_id, projectId, cohortId, body.person_ids);
  }

  @Delete(':cohortId/members')
  async removeMembers(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('cohortId') cohortId: string,
    @Body() body: StaticCohortMembersDto,
  ): Promise<void> {
    await this.cohortsService.removeStaticMembers(user.user_id, projectId, cohortId, body.person_ids);
  }
}
