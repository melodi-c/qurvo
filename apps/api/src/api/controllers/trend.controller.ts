import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TrendService } from '../../trend/trend.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { TrendQueryDto, TrendResponseDto } from '../dto/trend.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class TrendController {
  constructor(private readonly trendService: TrendService) {}

  @Post('trend')
  @HttpCode(200)
  async getTrend(
    @CurrentUser() user: RequestUser,
    @Body() body: TrendQueryDto,
  ): Promise<TrendResponseDto> {
    return this.trendService.getTrend(user.user_id, body);
  }
}
