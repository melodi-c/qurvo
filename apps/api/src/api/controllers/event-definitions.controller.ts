import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventDefinitionsService } from '../../event-definitions/event-definitions.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  EventDefinitionsListResponseDto,
  EventDefinitionsQueryDto,
  UpsertEventDefinitionDto,
  UpsertEventDefinitionResponseDto,
} from '../dto/event-definitions.dto';

@ApiTags('Event Definitions')
@ApiBearerAuth()
@Controller('api/projects/:projectId/event-definitions')
@UseGuards(SessionAuthGuard)
export class EventDefinitionsController {
  constructor(private readonly eventDefinitionsService: EventDefinitionsService) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Query() query: EventDefinitionsQueryDto,
  ): Promise<EventDefinitionsListResponseDto> {
    return this.eventDefinitionsService.list(user.user_id, projectId, {
      search: query.search,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      order_by: query.order_by ?? 'last_seen_at',
      order: query.order ?? 'desc',
    }) as any;
  }

  @Patch(':eventName')
  async upsert(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('eventName') eventName: string,
    @Body() body: UpsertEventDefinitionDto,
  ): Promise<UpsertEventDefinitionResponseDto> {
    return this.eventDefinitionsService.upsert(
      user.user_id,
      projectId,
      eventName,
      body,
    ) as any;
  }

  @Delete(':eventName')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('eventName') eventName: string,
  ): Promise<{ ok: boolean }> {
    return this.eventDefinitionsService.delete(user.user_id, projectId, eventName);
  }
}
