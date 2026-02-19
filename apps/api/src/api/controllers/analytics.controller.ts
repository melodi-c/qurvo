import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { FunnelQueryDto, FunnelResponseDto, EventsQueryDto, EventRowDto, EventNamesQueryDto, EventNamesResponseDto } from '../dto/analytics.dto';

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

  @Get('events')
  async getEvents(
    @CurrentUser() user: RequestUser,
    @Query() query: EventsQueryDto,
  ): Promise<EventRowDto[]> {
    return this.analyticsService.getEvents(user.user_id, query);
  }

  @Get('event-names')
  async getEventNames(
    @CurrentUser() user: RequestUser,
    @Query() query: EventNamesQueryDto,
  ): Promise<EventNamesResponseDto> {
    const event_names = await this.analyticsService.getEventNames(user.user_id, query.project_id);
    return { event_names };
  }
}
