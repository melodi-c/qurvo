import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AiMonitorsService } from '../../ai-monitors/ai-monitors.service';
import { RequireRole } from '../decorators/require-role.decorator';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { CreateMonitorDto, UpdateMonitorDto, AiMonitorDto } from '../dto/ai-monitors.dto';

@ApiTags('AI Monitors')
@ApiBearerAuth()
@Controller('api/projects/:projectId/ai/monitors')
@UseGuards(ProjectMemberGuard)
export class AiMonitorsController {
  constructor(private readonly monitorsService: AiMonitorsService) {}

  @Get()
  @ApiOkResponse({ type: [AiMonitorDto] })
  async list(@Param('projectId') projectId: string): Promise<AiMonitorDto[]> {
    return this.monitorsService.list(projectId) as any;
  }

  @Post()
  @RequireRole('editor')
  @ApiOkResponse({ type: AiMonitorDto })
  async create(
    @Param('projectId') projectId: string,
    @Body() body: CreateMonitorDto,
  ): Promise<AiMonitorDto> {
    return this.monitorsService.create(projectId, {
      event_name: body.event_name,
      metric: body.metric ?? 'count',
      threshold_sigma: body.threshold_sigma ?? 2.0,
      channel_type: body.channel_type,
      channel_config: body.channel_config,
    }) as any;
  }

  @Patch(':monitorId')
  @RequireRole('editor')
  @ApiOkResponse({ type: AiMonitorDto })
  async update(
    @Param('projectId') projectId: string,
    @Param('monitorId', ParseUUIDPipe) monitorId: string,
    @Body() body: UpdateMonitorDto,
  ): Promise<AiMonitorDto> {
    return this.monitorsService.update(projectId, monitorId, body) as any;
  }

  @Delete(':monitorId')
  @RequireRole('editor')
  async remove(
    @Param('projectId') projectId: string,
    @Param('monitorId', ParseUUIDPipe) monitorId: string,
  ): Promise<void> {
    await this.monitorsService.remove(projectId, monitorId);
  }
}
