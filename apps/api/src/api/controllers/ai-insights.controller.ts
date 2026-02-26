import { Controller, Get, Post, Param, ParseUUIDPipe, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AiInsightsService } from '../../ai-insights/ai-insights.service';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { AiInsightDto } from '../dto/ai-insights.dto';

@ApiTags('AI Insights')
@ApiBearerAuth()
@Controller('api/projects/:projectId/ai/insights')
@UseGuards(ProjectMemberGuard)
export class AiInsightsController {
  constructor(private readonly aiInsightsService: AiInsightsService) {}

  @Get()
  @ApiOkResponse({ type: [AiInsightDto] })
  async list(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<AiInsightDto[]> {
    return this.aiInsightsService.listInsights(projectId) as any;
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.aiInsightsService.dismissInsight(projectId, id);
  }
}
