import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards, ParseEnumPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PropertyDefinitionsService } from '../../definitions/property-definitions.service';
import { RequireRole } from '../decorators/require-role.decorator';
import {
  PropertyDefinitionQueryDto,
  PropertyDefinitionsListResponseDto,
  UpsertPropertyDefinitionDto,
  UpsertPropertyDefinitionResponseDto,
} from '../dto/property-definitions.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

enum PropertyType {
  event = 'event',
  person = 'person',
}

@ApiTags('Property Definitions')
@ApiBearerAuth()
@Controller('api/projects/:projectId/property-definitions')
@UseGuards(ProjectMemberGuard)
export class PropertyDefinitionsController {
  constructor(private readonly propertyDefinitionsService: PropertyDefinitionsService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @Query() query: PropertyDefinitionQueryDto,
  ): Promise<PropertyDefinitionsListResponseDto> {
    return this.propertyDefinitionsService.list(projectId, query) as any;
  }

  @RequireRole('editor')
  @Patch(':propertyType/:propertyName')
  async upsert(
    @Param('projectId') projectId: string,
    @Param('propertyType', new ParseEnumPipe(PropertyType)) propertyType: 'event' | 'person',
    @Param('propertyName') propertyName: string,
    @Body() body: UpsertPropertyDefinitionDto,
  ): Promise<UpsertPropertyDefinitionResponseDto> {
    return this.propertyDefinitionsService.upsert(
      projectId,
      propertyName,
      propertyType,
      body,
    ) as any;
  }

  @RequireRole('editor')
  @Delete(':propertyType/:propertyName')
  async remove(
    @Param('projectId') projectId: string,
    @Param('propertyType', new ParseEnumPipe(PropertyType)) propertyType: 'event' | 'person',
    @Param('propertyName') propertyName: string,
  ): Promise<void> {
    await this.propertyDefinitionsService.delete(projectId, propertyName, propertyType);
  }
}
