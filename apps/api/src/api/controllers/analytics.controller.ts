import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  EventsQueryDto,
  CountsQueryDto,
  TrendsQueryDto,
  TopEventsQueryDto,
  EventRowDto,
  CountsResponseDto,
  TrendItemDto,
  TopEventItemDto,
} from '../dto/analytics.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('events')
  async getEvents(@CurrentUser() user: RequestUser, @Query() query: EventsQueryDto): Promise<EventRowDto[]> {
    return this.analyticsService.getEvents(user.user_id, query);
  }

  @Get('counts')
  async getCounts(@CurrentUser() user: RequestUser, @Query() query: CountsQueryDto): Promise<CountsResponseDto> {
    return this.analyticsService.getCounts(user.user_id, query);
  }

  @Get('trends')
  async getTrends(@CurrentUser() user: RequestUser, @Query() query: TrendsQueryDto): Promise<TrendItemDto[]> {
    return this.analyticsService.getTrends(user.user_id, query);
  }

  @Get('top-events')
  async getTopEvents(@CurrentUser() user: RequestUser, @Query() query: TopEventsQueryDto): Promise<TopEventItemDto[]> {
    return this.analyticsService.getTopEvents(user.user_id, query);
  }
}
