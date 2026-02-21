import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LifecycleService } from '../../lifecycle/lifecycle.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { LifecycleQueryDto, LifecycleResponseDto } from '../dto/lifecycle.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  @Post('lifecycle')
  @HttpCode(200)
  async getLifecycle(
    @CurrentUser() user: RequestUser,
    @Body() body: LifecycleQueryDto,
  ): Promise<LifecycleResponseDto> {
    return this.lifecycleService.getLifecycle(user.user_id, body);
  }
}
