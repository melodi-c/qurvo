import { Controller, Get, Query, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { EventsService } from '../../events/events.service';
import {
  EventsQueryDto, EventRowDto,
  EventDetailDto, EventDetailQueryDto,
  EventNamesQueryDto, EventNamesResponseDto,
  EventPropertyNamesQueryDto, EventPropertyNamesResponseDto,
} from '../dto/events.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('events')
  async getEvents(
    @Query() query: EventsQueryDto,
  ): Promise<EventRowDto[]> {
    return this.eventsService.getEvents(query);
  }

  @Get('events/:eventId')
  async getEventDetail(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: EventDetailQueryDto,
  ): Promise<EventDetailDto> {
    return this.eventsService.getEventDetail(query.project_id, eventId, query.timestamp);
  }

  @Get('event-names')
  async getEventNames(
    @Query() query: EventNamesQueryDto,
  ): Promise<EventNamesResponseDto> {
    const event_names = await this.eventsService.getEventNames(query.project_id);
    return { event_names };
  }

  @Get('event-property-names')
  async getEventPropertyNames(
    @Query() query: EventPropertyNamesQueryDto,
  ): Promise<EventPropertyNamesResponseDto> {
    const property_names = await this.eventsService.getEventPropertyNames(query.project_id, query.event_name);
    return { property_names } as any;
  }
}
