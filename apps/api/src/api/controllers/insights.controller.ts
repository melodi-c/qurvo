import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { InsightsService } from '../../insights/insights.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { CreateInsightDto, UpdateInsightDto, InsightDto } from '../dto/insights.dto';
import type { InsightType } from '@shot/db';

@ApiTags('Insights')
@ApiBearerAuth()
@Controller('api/projects/:projectId/insights')
@UseGuards(SessionAuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  @ApiQuery({ name: 'type', required: false, enum: ['trend', 'funnel'] })
  async list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Query('type') type?: InsightType,
  ): Promise<InsightDto[]> {
    return this.insightsService.list(user.user_id, projectId, type) as any;
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateInsightDto,
  ): Promise<InsightDto> {
    return this.insightsService.create(user.user_id, projectId, body) as any;
  }

  @Get(':insightId')
  async getById(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('insightId') insightId: string,
  ): Promise<InsightDto> {
    return this.insightsService.getById(user.user_id, projectId, insightId) as any;
  }

  @Put(':insightId')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('insightId') insightId: string,
    @Body() body: UpdateInsightDto,
  ): Promise<InsightDto> {
    return this.insightsService.update(user.user_id, projectId, insightId, body) as any;
  }

  @Delete(':insightId')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('insightId') insightId: string,
  ): Promise<void> {
    await this.insightsService.remove(user.user_id, projectId, insightId);
  }
}
