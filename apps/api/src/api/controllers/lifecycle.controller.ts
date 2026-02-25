import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { LIFECYCLE_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { LifecycleQueryParams, LifecycleQueryResult } from '../../analytics/lifecycle/lifecycle.query';
import { LifecycleQueryDto, LifecycleResponseDto } from '../dto/lifecycle.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class LifecycleController {
  constructor(@Inject(LIFECYCLE_SERVICE) private readonly lifecycleService: AnalyticsQueryService<LifecycleQueryParams, LifecycleQueryResult>) {}

  @Get('lifecycle')
  async getLifecycle(
    @Query() query: LifecycleQueryDto,
  ): Promise<LifecycleResponseDto> {
    return this.lifecycleService.query(query);
  }
}
