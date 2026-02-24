import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LIFECYCLE_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { LifecycleQueryParams, LifecycleQueryResult } from '../../analytics/lifecycle/lifecycle.query';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { LifecycleQueryDto, LifecycleResponseDto } from '../dto/lifecycle.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
export class LifecycleController {
  constructor(@Inject(LIFECYCLE_SERVICE) private readonly lifecycleService: AnalyticsQueryService<LifecycleQueryParams, LifecycleQueryResult>) {}

  @Get('lifecycle')
  async getLifecycle(
    @CurrentUser() user: RequestUser,
    @Query() query: LifecycleQueryDto,
  ): Promise<LifecycleResponseDto> {
    return this.lifecycleService.query(user.user_id, query);
  }
}
