import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FunnelService } from '../../funnel/funnel.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  FunnelQueryDto,
  FunnelResponseDto,
  FunnelTimeToConvertQueryDto,
  TimeToConvertResponseDto,
} from '../dto/funnel.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class FunnelController {
  constructor(private readonly funnelService: FunnelService) {}

  @Get('funnel')
  async getFunnel(
    @CurrentUser() user: RequestUser,
    @Query() query: FunnelQueryDto,
  ): Promise<FunnelResponseDto> {
    return this.funnelService.getFunnel(user.user_id, query) as any;
  }

  @Get('funnel/time-to-convert')
  async getFunnelTimeToConvert(
    @CurrentUser() user: RequestUser,
    @Query() query: FunnelTimeToConvertQueryDto,
  ): Promise<TimeToConvertResponseDto> {
    return this.funnelService.getFunnelTimeToConvert(user.user_id, query) as any;
  }
}
