import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FunnelService } from '../../funnel/funnel.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { FunnelQueryDto, FunnelResponseDto } from '../dto/funnel.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class FunnelController {
  constructor(private readonly funnelService: FunnelService) {}

  @Post('funnel')
  @HttpCode(200)
  async getFunnel(
    @CurrentUser() user: RequestUser,
    @Body() body: FunnelQueryDto,
  ): Promise<FunnelResponseDto> {
    return this.funnelService.getFunnel(user.user_id, body);
  }
}
