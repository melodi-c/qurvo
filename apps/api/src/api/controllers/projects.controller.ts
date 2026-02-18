import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from '../../projects/projects.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { CreateProjectDto, UpdateProjectDto, ProjectDto, ProjectWithRoleDto } from '../dto/projects.dto';
import { OkResponseDto } from '../dto/auth.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('api/projects')
@UseGuards(SessionAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<ProjectWithRoleDto[]> {
    return this.projectsService.list(user.user_id);
  }

  @Get(':id')
  async getById(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<ProjectWithRoleDto> {
    return this.projectsService.getById(user.user_id, id);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() body: CreateProjectDto): Promise<ProjectDto> {
    return this.projectsService.create(user.user_id, body);
  }

  @Put(':id')
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: UpdateProjectDto): Promise<ProjectDto> {
    return this.projectsService.update(user.user_id, id, body);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<OkResponseDto> {
    return this.projectsService.remove(user.user_id, id);
  }
}
