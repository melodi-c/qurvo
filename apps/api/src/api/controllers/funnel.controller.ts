import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FUNNEL_SERVICE, FUNNEL_TTC_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { FunnelQueryParams, FunnelQueryResult, TimeToConvertParams, TimeToConvertResult } from '../../analytics/funnel/funnel.query';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  FunnelQueryDto,
  FunnelResponseDto,
  FunnelTimeToConvertQueryDto,
  TimeToConvertResponseDto,
} from '../dto/funnel.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
export class FunnelController {
  constructor(
    @Inject(FUNNEL_SERVICE) private readonly funnelService: AnalyticsQueryService<FunnelQueryParams, FunnelQueryResult>,
    @Inject(FUNNEL_TTC_SERVICE) private readonly ttcService: AnalyticsQueryService<TimeToConvertParams, TimeToConvertResult>,
  ) {}

  @Get('funnel')
  async getFunnel(
    @CurrentUser() user: RequestUser,
    @Query() query: FunnelQueryDto,
  ): Promise<FunnelResponseDto> {
    return this.funnelService.query(user.user_id, query) as any;
  }

  @Get('funnel/time-to-convert')
  async getFunnelTimeToConvert(
    @CurrentUser() user: RequestUser,
    @Query() query: FunnelTimeToConvertQueryDto,
  ): Promise<TimeToConvertResponseDto> {
    return this.ttcService.query(user.user_id, query) as any;
  }
}
