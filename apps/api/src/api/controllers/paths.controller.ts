import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { PATHS_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { PathsQueryParams, PathsQueryResult } from '../../analytics/paths/paths.query';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { PathsQueryDto, PathsResponseDto } from '../dto/paths.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class PathsController {
  constructor(@Inject(PATHS_SERVICE) private readonly pathsService: AnalyticsQueryService<PathsQueryParams, PathsQueryResult>) {}

  @Get('paths')
  async getPaths(
    @CurrentUser() user: RequestUser,
    @Query() query: PathsQueryDto,
  ): Promise<PathsResponseDto> {
    return this.pathsService.query(user.user_id, {
      ...query,
      step_limit: query.step_limit ?? 5,
    });
  }
}
