import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StickinessService } from '../../analytics/stickiness/stickiness.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { StickinessQueryDto, StickinessResponseDto } from '../dto/stickiness.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class StickinessController {
  constructor(private readonly stickinessService: StickinessService) {}

  @Get('stickiness')
  async getStickiness(
    @CurrentUser() user: RequestUser,
    @Query() query: StickinessQueryDto,
  ): Promise<StickinessResponseDto> {
    return this.stickinessService.getStickiness(user.user_id, query);
  }
}
