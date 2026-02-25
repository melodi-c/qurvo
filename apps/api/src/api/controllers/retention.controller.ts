import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { RETENTION_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { RetentionQueryParams, RetentionQueryResult } from '../../analytics/retention/retention.query';
import { RetentionQueryDto, RetentionResponseDto } from '../dto/retention.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class RetentionController {
  constructor(@Inject(RETENTION_SERVICE) private readonly retentionService: AnalyticsQueryService<RetentionQueryParams, RetentionQueryResult>) {}

  @Get('retention')
  async getRetention(
    @Query() query: RetentionQueryDto,
  ): Promise<RetentionResponseDto> {
    return this.retentionService.query(query);
  }
}
