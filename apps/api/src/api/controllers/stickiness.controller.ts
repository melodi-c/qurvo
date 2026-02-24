import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { STICKINESS_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { StickinessQueryParams, StickinessQueryResult } from '../../analytics/stickiness/stickiness.query';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { StickinessQueryDto, StickinessResponseDto } from '../dto/stickiness.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
export class StickinessController {
  constructor(@Inject(STICKINESS_SERVICE) private readonly stickinessService: AnalyticsQueryService<StickinessQueryParams, StickinessQueryResult>) {}

  @Get('stickiness')
  async getStickiness(
    @CurrentUser() user: RequestUser,
    @Query() query: StickinessQueryDto,
  ): Promise<StickinessResponseDto> {
    return this.stickinessService.query(user.user_id, query);
  }
}
