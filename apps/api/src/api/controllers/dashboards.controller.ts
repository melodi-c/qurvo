import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
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
    @CurrentUser() user: RequestUser,
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
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
  ): Promise<DashboardWithWidgetsDto> {
    return this.dashboardsService.getById(projectId, dashboardId);
  }

  @RequireRole('editor')
  @Put(':dashboardId')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() body: UpdateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.update(projectId, dashboardId, body);
  }

  @RequireRole('editor')
  @Delete(':dashboardId')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
  ): Promise<void> {
    await this.dashboardsService.remove(projectId, dashboardId);
  }

  @RequireRole('editor')
  @Post(':dashboardId/widgets')
  async addWidget(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() body: CreateWidgetDto,
  ): Promise<WidgetDto> {
    return this.dashboardsService.addWidget(projectId, dashboardId, body) as any;
  }

  @RequireRole('editor')
  @Put(':dashboardId/widgets/:widgetId')
  async updateWidget(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() body: UpdateWidgetDto,
  ): Promise<WidgetDto> {
    return this.dashboardsService.updateWidget(projectId, dashboardId, widgetId, body) as any;
  }

  @RequireRole('editor')
  @Delete(':dashboardId/widgets/:widgetId')
  async removeWidget(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ): Promise<void> {
    await this.dashboardsService.removeWidget(projectId, dashboardId, widgetId);
  }
}
