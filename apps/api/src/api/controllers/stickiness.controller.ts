import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { STICKINESS_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { StickinessQueryParams, StickinessQueryResult } from '../../analytics/stickiness/stickiness.query';
import { StickinessQueryDto, StickinessResponseDto } from '../dto/stickiness.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class StickinessController {
  constructor(@Inject(STICKINESS_SERVICE) private readonly stickinessService: AnalyticsQueryService<StickinessQueryParams, StickinessQueryResult>) {}

  @Get('stickiness')
  async getStickiness(
    @Query() query: StickinessQueryDto,
  ): Promise<StickinessResponseDto> {
    return this.stickinessService.query(query) as any;
  }
}
