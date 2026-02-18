import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { CreateApiKeyDto, ApiKeyDto, ApiKeyCreatedDto } from '../dto/api-keys.dto';
import { OkResponseDto } from '../dto/auth.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api/projects/:projectId/keys')
@UseGuards(SessionAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string): Promise<ApiKeyDto[]> {
    return this.apiKeysService.list(projectId, user.user_id);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() body: CreateApiKeyDto): Promise<ApiKeyCreatedDto> {
    return this.apiKeysService.create(projectId, user.user_id, body);
  }

  @Delete(':keyId')
  async revoke(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('keyId') keyId: string): Promise<OkResponseDto> {
    return this.apiKeysService.revoke(keyId, projectId, user.user_id);
  }
}
