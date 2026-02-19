import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { FunnelQueryDto, FunnelResponseDto } from '../dto/analytics.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('funnel')
  async getFunnel(
    @CurrentUser() user: RequestUser,
    @Body() body: FunnelQueryDto,
  ): Promise<FunnelResponseDto> {
    return this.analyticsService.getFunnel(user.user_id, body);
  }
}
