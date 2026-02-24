import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { WebAnalyticsService } from '../../web-analytics/web-analytics.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  WebAnalyticsQueryDto,
  WebAnalyticsOverviewResponseDto,
  WebAnalyticsPathsResponseDto,
  WebAnalyticsSourcesResponseDto,
  WebAnalyticsDevicesResponseDto,
  WebAnalyticsGeographyResponseDto,
} from '../dto/web-analytics.dto';

@ApiTags('Web Analytics')
@ApiBearerAuth()
@Controller('api/web-analytics')
@UseGuards(ProjectMemberGuard)
export class WebAnalyticsController {
  constructor(private readonly webAnalyticsService: WebAnalyticsService) {}

  @Get('overview')
  async getOverview(
    @CurrentUser() user: RequestUser,
    @Query() query: WebAnalyticsQueryDto,
  ): Promise<WebAnalyticsOverviewResponseDto> {
    return this.webAnalyticsService.getOverview(query) as any;
  }

  @Get('paths')
  async getPaths(
    @CurrentUser() user: RequestUser,
    @Query() query: WebAnalyticsQueryDto,
  ): Promise<WebAnalyticsPathsResponseDto> {
    return this.webAnalyticsService.getPaths(query) as any;
  }

  @Get('sources')
  async getSources(
    @CurrentUser() user: RequestUser,
    @Query() query: WebAnalyticsQueryDto,
  ): Promise<WebAnalyticsSourcesResponseDto> {
    return this.webAnalyticsService.getSources(query) as any;
  }

  @Get('devices')
  async getDevices(
    @CurrentUser() user: RequestUser,
    @Query() query: WebAnalyticsQueryDto,
  ): Promise<WebAnalyticsDevicesResponseDto> {
    return this.webAnalyticsService.getDevices(query) as any;
  }

  @Get('geography')
  async getGeography(
    @CurrentUser() user: RequestUser,
    @Query() query: WebAnalyticsQueryDto,
  ): Promise<WebAnalyticsGeographyResponseDto> {
    return this.webAnalyticsService.getGeography(query) as any;
  }
}
