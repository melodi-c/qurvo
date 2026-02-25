import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { PATHS_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { PathsQueryParams, PathsQueryResult } from '../../analytics/paths/paths.query';
import { PathsQueryDto, PathsResponseDto } from '../dto/paths.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class PathsController {
  constructor(@Inject(PATHS_SERVICE) private readonly pathsService: AnalyticsQueryService<PathsQueryParams, PathsQueryResult>) {}

  @Get('paths')
  async getPaths(
    @Query() query: PathsQueryDto,
  ): Promise<PathsResponseDto> {
    return this.pathsService.query({ ...query, step_limit: query.step_limit ?? 5 });
  }
}
