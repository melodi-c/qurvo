import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { TREND_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { TrendQueryParams, TrendQueryResult } from '../../analytics/trend/trend.query';
import { TrendQueryDto, TrendResponseDto } from '../dto/trend.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class TrendController {
  constructor(@Inject(TREND_SERVICE) private readonly trendService: AnalyticsQueryService<TrendQueryParams, TrendQueryResult>) {}

  @Get('trend')
  async getTrend(
    @Query() query: TrendQueryDto,
  ): Promise<TrendResponseDto> {
    return this.trendService.query(query);
  }
}
