import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FunnelService } from '../../funnel/funnel.service';
import { EventsService } from '../../events/events.service';
import { TrendService } from '../../trend/trend.service';
import { RetentionService } from '../../retention/retention.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  FunnelQueryDto, FunnelResponseDto,
  EventsQueryDto, EventRowDto,
  EventNamesQueryDto, EventNamesResponseDto,
  TrendQueryDto, TrendResponseDto,
  RetentionQueryDto, RetentionResponseDto,
} from '../dto/analytics.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly funnelService: FunnelService,
    private readonly eventsService: EventsService,
    private readonly trendService: TrendService,
    private readonly retentionService: RetentionService,
  ) {}

  @Post('funnel')
  async getFunnel(
    @CurrentUser() user: RequestUser,
    @Body() body: FunnelQueryDto,
  ): Promise<FunnelResponseDto> {
    return this.funnelService.getFunnel(user.user_id, body);
  }

  @Get('events')
  async getEvents(
    @CurrentUser() user: RequestUser,
    @Query() query: EventsQueryDto,
  ): Promise<EventRowDto[]> {
    return this.eventsService.getEvents(user.user_id, query);
  }

  @Get('event-names')
  async getEventNames(
    @CurrentUser() user: RequestUser,
    @Query() query: EventNamesQueryDto,
  ): Promise<EventNamesResponseDto> {
    const event_names = await this.eventsService.getEventNames(user.user_id, query.project_id);
    return { event_names };
  }

  @Post('trend')
  async getTrend(
    @CurrentUser() user: RequestUser,
    @Body() body: TrendQueryDto,
  ): Promise<TrendResponseDto> {
    return this.trendService.getTrend(user.user_id, body);
  }

  @Post('retention')
  async getRetention(
    @CurrentUser() user: RequestUser,
    @Body() body: RetentionQueryDto,
  ): Promise<RetentionResponseDto> {
    return this.retentionService.getRetention(user.user_id, body);
  }
}
