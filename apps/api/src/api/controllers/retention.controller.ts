import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RETENTION_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { RetentionQueryParams, RetentionQueryResult } from '../../analytics/retention/retention.query';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RetentionQueryDto, RetentionResponseDto } from '../dto/retention.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
export class RetentionController {
  constructor(@Inject(RETENTION_SERVICE) private readonly retentionService: AnalyticsQueryService<RetentionQueryParams, RetentionQueryResult>) {}

  @Get('retention')
  async getRetention(
    @CurrentUser() user: RequestUser,
    @Query() query: RetentionQueryDto,
  ): Promise<RetentionResponseDto> {
    return this.retentionService.query(user.user_id, query);
  }
}
