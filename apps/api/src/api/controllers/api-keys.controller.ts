import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { RequireRole } from '../decorators/require-role.decorator';
import { CreateApiKeyDto, ApiKeyDto, ApiKeyCreatedDto } from '../dto/api-keys.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api/projects/:projectId/keys')
@UseGuards(ProjectMemberGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(@Param('projectId') projectId: string): Promise<ApiKeyDto[]> {
    return this.apiKeysService.list(projectId);
  }

  @RequireRole('editor')
  @Post()
  async create(@Param('projectId') projectId: string, @Body() body: CreateApiKeyDto): Promise<ApiKeyCreatedDto> {
    return this.apiKeysService.create(projectId, body);
  }

  @RequireRole('editor')
  @Delete(':keyId')
  async revoke(@Param('projectId') projectId: string, @Param('keyId') keyId: string): Promise<void> {
    await this.apiKeysService.revoke(projectId, keyId);
  }
}
