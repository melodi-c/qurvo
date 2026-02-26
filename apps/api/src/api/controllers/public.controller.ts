import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { ShareTokensService } from '../../share-tokens/share-tokens.service';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { DashboardWithWidgetsDto } from '../dto/dashboards.dto';
import { InsightDto } from '../dto/insights.dto';

@ApiTags('Public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly shareTokensService: ShareTokensService,
    private readonly dashboardsService: DashboardsService,
    private readonly savedInsightsService: SavedInsightsService,
  ) {}

  @Get('dashboards/:shareToken')
  async getPublicDashboard(
    @Param('shareToken') shareToken: string,
  ): Promise<DashboardWithWidgetsDto> {
    const token = await this.shareTokensService.findDashboardToken(shareToken);
    return this.dashboardsService.getById(token.project_id, token.resource_id) as any;
  }

  @Get('insights/:shareToken')
  async getPublicInsight(
    @Param('shareToken') shareToken: string,
  ): Promise<InsightDto> {
    const token = await this.shareTokensService.findInsightToken(shareToken);
    return this.savedInsightsService.getById(token.project_id, token.resource_id) as any;
  }
}
