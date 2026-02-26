import { Controller, Get, Post, Delete, Put, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { ShareTokensService } from '../../share-tokens/share-tokens.service';
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
import { CreateShareTokenDto, ShareTokenDto } from '../dto/share-tokens.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('api/projects/:projectId/dashboards')
@UseGuards(ProjectMemberGuard)
export class DashboardsController {
  constructor(
    private readonly dashboardsService: DashboardsService,
    private readonly shareTokensService: ShareTokensService,
  ) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
  ): Promise<DashboardDto[]> {
    return this.dashboardsService.list(projectId) as any;
  }

  @RequireRole('editor')
  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.create(user.user_id, projectId, body) as any;
  }

  @Get(':dashboardId')
  async getById(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
  ): Promise<DashboardWithWidgetsDto> {
    return this.dashboardsService.getById(projectId, dashboardId) as any;
  }

  @RequireRole('editor')
  @Put(':dashboardId')
  async update(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() body: UpdateDashboardDto,
  ): Promise<DashboardDto> {
    return this.dashboardsService.update(projectId, dashboardId, body) as any;
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

  // ── Share tokens ───────────────────────────────────────────────────────────

  @RequireRole('editor')
  @Post(':dashboardId/share')
  async createShareToken(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() body: CreateShareTokenDto,
  ): Promise<ShareTokenDto> {
    return this.shareTokensService.create(
      projectId,
      user.user_id,
      'dashboard',
      dashboardId,
      body.expires_at ? new Date(body.expires_at) : undefined,
    ) as any;
  }

  @Get(':dashboardId/share')
  async listShareTokens(
    @Param('projectId') projectId: string,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
  ): Promise<ShareTokenDto[]> {
    return this.shareTokensService.listByResource(projectId, 'dashboard', dashboardId) as any;
  }

  @RequireRole('editor')
  @Delete(':dashboardId/share/:tokenId')
  async revokeShareToken(
    @Param('projectId') projectId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ): Promise<void> {
    await this.shareTokensService.revoke(projectId, tokenId);
  }
}
