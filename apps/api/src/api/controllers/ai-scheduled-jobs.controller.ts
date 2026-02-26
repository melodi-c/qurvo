import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AiScheduledJobsService } from '../../ai-scheduled-jobs/ai-scheduled-jobs.service';
import { RequireRole } from '../decorators/require-role.decorator';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { CreateScheduledJobDto, UpdateScheduledJobDto, AiScheduledJobDto } from '../dto/ai-scheduled-jobs.dto';

@ApiTags('AI Scheduled Jobs')
@ApiBearerAuth()
@Controller('api/projects/:projectId/ai/scheduled-jobs')
@UseGuards(ProjectMemberGuard)
export class AiScheduledJobsController {
  constructor(private readonly scheduledJobsService: AiScheduledJobsService) {}

  @Get()
  @ApiOkResponse({ type: [AiScheduledJobDto] })
  async list(@Param('projectId') projectId: string): Promise<AiScheduledJobDto[]> {
    return this.scheduledJobsService.list(projectId) as any;
  }

  @Post()
  @RequireRole('editor')
  @ApiOkResponse({ type: AiScheduledJobDto })
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateScheduledJobDto,
  ): Promise<AiScheduledJobDto> {
    return this.scheduledJobsService.create(projectId, user.user_id, {
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule,
      channel_type: body.channel_type,
      channel_config: body.channel_config,
    }) as any;
  }

  @Patch(':jobId')
  @RequireRole('editor')
  @ApiOkResponse({ type: AiScheduledJobDto })
  async update(
    @Param('projectId') projectId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() body: UpdateScheduledJobDto,
  ): Promise<AiScheduledJobDto> {
    return this.scheduledJobsService.update(projectId, jobId, body) as any;
  }

  @Delete(':jobId')
  @RequireRole('editor')
  async remove(
    @Param('projectId') projectId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    await this.scheduledJobsService.remove(projectId, jobId);
  }
}
