import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RequireRole } from '../decorators/require-role.decorator';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
  CreateWidgetDto,
  UpdateWidgetDto,
  DashboardDto,
  DashboardWithWidgetsDto,
  WidgetDto,
} from '../dto/dashboards.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('api/projects/:projectId/dashboards')
@UseGuards(ProjectMemberGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
  ): Promise<DashboardDto[]> {
    return this.dashboardsService.list(projectId);
  }

  @RequireRole('editor')
  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.create(user.user_id, projectId, body);
  }

  @Get(':dashboardId')
  async getById(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
  ): Promise<DashboardWithWidgetsDto> {
    return this.dashboardsService.getById(projectId, dashboardId);
  }

  @RequireRole('editor')
  @Put(':dashboardId')
  async update(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() body: UpdateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.update(projectId, dashboardId, body);
  }

  @RequireRole('editor')
  @Delete(':dashboardId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
  ): Promise<void> {
    await this.dashboardsService.remove(projectId, dashboardId);
  }

  @RequireRole('editor')
  @Post(':dashboardId/widgets')
  async addWidget(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() body: CreateWidgetDto,
  ): Promise<WidgetDto> {
    return this.dashboardsService.addWidget(projectId, dashboardId, body) as any;
  }

  @RequireRole('editor')
  @Put(':dashboardId/widgets/:widgetId')
  async updateWidget(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() body: UpdateWidgetDto,
  ): Promise<WidgetDto> {
    return this.dashboardsService.updateWidget(projectId, dashboardId, widgetId, body) as any;
  }

  @RequireRole('editor')
  @Delete(':dashboardId/widgets/:widgetId')
  async removeWidget(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
  ): Promise<void> {
    await this.dashboardsService.removeWidget(projectId, dashboardId, widgetId);
  }
}
