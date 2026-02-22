import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventDefinitionsService } from '../../event-definitions/event-definitions.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  EventDefinitionDto,
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
  ): Promise<EventDefinitionDto[]> {
    return this.eventDefinitionsService.list(user.user_id, projectId) as any;
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
}
