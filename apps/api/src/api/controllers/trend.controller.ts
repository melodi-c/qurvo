import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TREND_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { TrendQueryParams, TrendQueryResult } from '../../analytics/trend/trend.query';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { TrendQueryDto, TrendResponseDto } from '../dto/trend.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
export class TrendController {
  constructor(@Inject(TREND_SERVICE) private readonly trendService: AnalyticsQueryService<TrendQueryParams, TrendQueryResult>) {}

  @Get('trend')
  async getTrend(
    @CurrentUser() user: RequestUser,
    @Query() query: TrendQueryDto,
  ): Promise<TrendResponseDto> {
    return this.trendService.query(user.user_id, query);
  }
}
