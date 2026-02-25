import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventDefinitionsService } from '../../definitions/event-definitions.service';
import { RequireRole } from '../decorators/require-role.decorator';
import {
  EventDefinitionsListResponseDto,
  EventDefinitionsQueryDto,
  UpsertEventDefinitionDto,
  UpsertEventDefinitionResponseDto,
} from '../dto/event-definitions.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('Event Definitions')
@ApiBearerAuth()
@Controller('api/projects/:projectId/event-definitions')
@UseGuards(ProjectMemberGuard)
export class EventDefinitionsController {
  constructor(private readonly eventDefinitionsService: EventDefinitionsService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @Query() query: EventDefinitionsQueryDto,
  ): Promise<EventDefinitionsListResponseDto> {
    return this.eventDefinitionsService.list(projectId, {
      ...query,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      order_by: query.order_by ?? 'last_seen_at',
      order: query.order ?? 'desc',
    }) as any;
  }

  @RequireRole('editor')
  @Patch(':eventName')
  async upsert(
    @Param('projectId') projectId: string,
    @Param('eventName') eventName: string,
    @Body() body: UpsertEventDefinitionDto,
  ): Promise<UpsertEventDefinitionResponseDto> {
    return this.eventDefinitionsService.upsert(
      projectId,
      eventName,
      body,
    ) as any;
  }

  @RequireRole('editor')
  @Delete(':eventName')
  async remove(
    @Param('projectId') projectId: string,
    @Param('eventName') eventName: string,
  ): Promise<void> {
    await this.eventDefinitionsService.delete(projectId, eventName);
  }
}
