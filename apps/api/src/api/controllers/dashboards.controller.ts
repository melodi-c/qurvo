import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
  CreateWidgetDto,
  UpdateWidgetDto,
  DashboardDto,
  DashboardWithWidgetsDto,
  WidgetDto,
} from '../dto/dashboards.dto';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('api/projects/:projectId/dashboards')
@UseGuards(SessionAuthGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<DashboardDto[]> {
    return this.dashboardsService.list(user.user_id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.create(user.user_id, projectId, body);
  }

  @Get(':dashboardId')
  getById(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
  ): Promise<DashboardWithWidgetsDto> {
    return this.dashboardsService.getById(user.user_id, projectId, dashboardId);
  }

  @Put(':dashboardId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() body: UpdateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.update(user.user_id, projectId, dashboardId, body);
  }

  @Delete(':dashboardId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
  ): Promise<{ ok: boolean }> {
    return this.dashboardsService.remove(user.user_id, projectId, dashboardId);
  }

  @Post(':dashboardId/widgets')
  addWidget(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() body: CreateWidgetDto,
  ): Promise<WidgetDto> {
    return this.dashboardsService.addWidget(user.user_id, projectId, dashboardId, body) as any;
  }

  @Put(':dashboardId/widgets/:widgetId')
  updateWidget(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() body: UpdateWidgetDto,
  ): Promise<WidgetDto> {
    return this.dashboardsService.updateWidget(user.user_id, projectId, dashboardId, widgetId, body) as any;
  }

  @Delete(':dashboardId/widgets/:widgetId')
  removeWidget(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ): Promise<{ ok: boolean }> {
    return this.dashboardsService.removeWidget(user.user_id, projectId, dashboardId, widgetId);
  }
}
