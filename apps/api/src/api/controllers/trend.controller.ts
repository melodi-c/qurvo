import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { TREND_SERVICE, TREND_AGGREGATE_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { TrendQueryParams, TrendQueryResult } from '../../analytics/trend/trend.query';
import type { TrendAggregateQueryParams, TrendAggregateQueryResult } from '../../analytics/trend/trend-aggregate.query';
import { TrendQueryDto, TrendResponseDto } from '../dto/trend.dto';
import { TrendAggregateQueryDto, TrendAggregateResponseDto } from '../dto/trend-aggregate.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class TrendController {
  constructor(
    @Inject(TREND_SERVICE) private readonly trendService: AnalyticsQueryService<TrendQueryParams, TrendQueryResult>,
    @Inject(TREND_AGGREGATE_SERVICE) private readonly trendAggregateService: AnalyticsQueryService<TrendAggregateQueryParams, TrendAggregateQueryResult>,
  ) {}

  @Get('trend')
  async getTrend(
    @Query() query: TrendQueryDto,
  ): Promise<TrendResponseDto> {
    return this.trendService.query(query) as any;
  }

  @Get('trend/aggregate')
  async getTrendAggregate(
    @Query() query: TrendAggregateQueryDto,
  ): Promise<TrendAggregateResponseDto> {
    return this.trendAggregateService.query(query) as any;
  }
}
