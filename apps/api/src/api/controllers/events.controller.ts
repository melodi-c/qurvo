import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventsService } from '../../events/events.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  EventsQueryDto, EventRowDto,
  EventDetailDto, EventDetailQueryDto,
  EventNamesQueryDto, EventNamesResponseDto,
  EventPropertyNamesQueryDto, EventPropertyNamesResponseDto,
} from '../dto/events.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('events')
  async getEvents(
    @CurrentUser() user: RequestUser,
    @Query() query: EventsQueryDto,
  ): Promise<EventRowDto[]> {
    return this.eventsService.getEvents(user.user_id, query);
  }

  @Get('events/:eventId')
  async getEventDetail(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Query() query: EventDetailQueryDto,
  ): Promise<EventDetailDto> {
    return this.eventsService.getEventDetail(user.user_id, query.project_id, eventId);
  }

  @Get('event-names')
  async getEventNames(
    @CurrentUser() user: RequestUser,
    @Query() query: EventNamesQueryDto,
  ): Promise<EventNamesResponseDto> {
    const event_names = await this.eventsService.getEventNames(user.user_id, query.project_id);
    return { event_names };
  }

  @Get('event-property-names')
  async getEventPropertyNames(
    @CurrentUser() user: RequestUser,
    @Query() query: EventPropertyNamesQueryDto,
  ): Promise<EventPropertyNamesResponseDto> {
    const property_names = await this.eventsService.getEventPropertyNames(user.user_id, query.project_id);
    return { property_names } as any;
  }
}
