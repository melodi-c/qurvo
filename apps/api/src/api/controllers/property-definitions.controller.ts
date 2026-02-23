import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PropertyDefinitionsService } from '../../definitions/property-definitions.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  PropertyDefinitionQueryDto,
  PropertyDefinitionsListResponseDto,
  UpsertPropertyDefinitionDto,
  UpsertPropertyDefinitionResponseDto,
} from '../dto/property-definitions.dto';

@ApiTags('Property Definitions')
@ApiBearerAuth()
@Controller('api/projects/:projectId/property-definitions')
@UseGuards(SessionAuthGuard)
export class PropertyDefinitionsController {
  constructor(private readonly propertyDefinitionsService: PropertyDefinitionsService) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Query() query: PropertyDefinitionQueryDto,
  ): Promise<PropertyDefinitionsListResponseDto> {
    return this.propertyDefinitionsService.list(user.user_id, projectId, {
      type: query.type,
      eventName: query.event_name,
      search: query.search,
      is_numerical: query.is_numerical,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      order_by: query.order_by ?? 'last_seen_at',
      order: query.order ?? 'desc',
    }) as any;
  }

  @Patch(':propertyType/:propertyName')
  async upsert(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('propertyType') propertyType: 'event' | 'person',
    @Param('propertyName') propertyName: string,
    @Body() body: UpsertPropertyDefinitionDto,
  ): Promise<UpsertPropertyDefinitionResponseDto> {
    return this.propertyDefinitionsService.upsert(
      user.user_id,
      projectId,
      propertyName,
      propertyType,
      body,
    ) as any;
  }

  @Delete(':propertyType/:propertyName')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('propertyType') propertyType: 'event' | 'person',
    @Param('propertyName') propertyName: string,
  ): Promise<{ ok: boolean }> {
    return this.propertyDefinitionsService.delete(user.user_id, projectId, propertyName, propertyType);
  }
}
