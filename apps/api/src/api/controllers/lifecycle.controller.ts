import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LifecycleService } from '../../analytics/lifecycle/lifecycle.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { LifecycleQueryDto, LifecycleResponseDto } from '../dto/lifecycle.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  @Get('lifecycle')
  async getLifecycle(
    @CurrentUser() user: RequestUser,
    @Query() query: LifecycleQueryDto,
  ): Promise<LifecycleResponseDto> {
    return this.lifecycleService.getLifecycle(user.user_id, query);
  }
}
