import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { CreateApiKeyDto, ApiKeyDto, ApiKeyCreatedDto } from '../dto/api-keys.dto';
import { OkResponseDto } from '../dto/auth.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api/projects/:projectId/keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string): Promise<ApiKeyDto[]> {
    return this.apiKeysService.list(user.user_id, projectId);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() body: CreateApiKeyDto): Promise<ApiKeyCreatedDto> {
    return this.apiKeysService.create(user.user_id, projectId, body);
  }

  @Delete(':keyId')
  async revoke(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('keyId') keyId: string): Promise<OkResponseDto> {
    return this.apiKeysService.revoke(user.user_id, projectId, keyId);
  }
}
