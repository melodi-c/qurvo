import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PathsService } from '../../paths/paths.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { PathsQueryDto, PathsResponseDto } from '../dto/paths.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class PathsController {
  constructor(private readonly pathsService: PathsService) {}

  @Get('paths')
  async getPaths(
    @CurrentUser() user: RequestUser,
    @Query() query: PathsQueryDto,
  ): Promise<PathsResponseDto> {
    return this.pathsService.getPaths(user.user_id, {
      ...query,
      step_limit: query.step_limit ?? 5,
    });
  }
}
