import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RequireRole } from '../decorators/require-role.decorator';
import { CreateInsightDto, UpdateInsightDto, InsightDto, ListInsightsQueryDto } from '../dto/insights.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import type { InsightConfig } from '@qurvo/db';

@ApiTags('Insights')
@ApiBearerAuth()
@Controller('api/projects/:projectId/insights')
@UseGuards(ProjectMemberGuard)
export class SavedInsightsController {
  constructor(private readonly insightsService: SavedInsightsService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @Query() query: ListInsightsQueryDto,
  ): Promise<InsightDto[]> {
    return this.insightsService.list(projectId, query.type) as any;
  }

  @RequireRole('editor')
  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateInsightDto,
  ): Promise<InsightDto> {
    const { config, ...rest } = body;
    return this.insightsService.create(user.user_id, projectId, {
      ...rest,
      config: config as unknown as InsightConfig,
    }) as any;
  }

  @Get(':insightId')
  async getById(
    @Param('projectId') projectId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
  ): Promise<InsightDto> {
    return this.insightsService.getById(projectId, insightId) as any;
  }

  @RequireRole('editor')
  @Put(':insightId')
  async update(
    @Param('projectId') projectId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
    @Body() body: UpdateInsightDto,
  ): Promise<InsightDto> {
    const { config, ...rest } = body;
    return this.insightsService.update(projectId, insightId, {
      ...rest,
      ...(config !== undefined && { config: config as unknown as InsightConfig }),
    }) as any;
  }

  @RequireRole('editor')
  @Delete(':insightId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('insightId', ParseUUIDPipe) insightId: string,
  ): Promise<void> {
    await this.insightsService.remove(projectId, insightId);
  }
}
