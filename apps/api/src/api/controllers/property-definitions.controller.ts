import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PropertyDefinitionsService } from '../../property-definitions/property-definitions.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  PropertyDefinitionDto,
  PropertyDefinitionQueryDto,
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
  ): Promise<PropertyDefinitionDto[]> {
    return this.propertyDefinitionsService.list(user.user_id, projectId, query.type, query.event_name) as any;
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
}
