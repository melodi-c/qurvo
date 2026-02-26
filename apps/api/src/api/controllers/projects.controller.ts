import { Controller, Get, Post, Put, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from '../../projects/projects.service';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { CreateProjectDto, UpdateProjectDto, ProjectDto, ProjectWithRoleDto } from '../dto/projects.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('api/projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly demoSeedService: DemoSeedService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<ProjectWithRoleDto[]> {
    return this.projectsService.list(user.user_id) as any;
  }

  @Get(':id')
  async getById(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<ProjectWithRoleDto> {
    return this.projectsService.getById(user.user_id, id) as any;
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() body: CreateProjectDto): Promise<ProjectDto> {
    return this.projectsService.create(user.user_id, body) as any;
  }

  @Post('demo')
  async createDemo(@CurrentUser() user: RequestUser): Promise<ProjectDto> {
    const project = await this.projectsService.create(user.user_id, {
      name: 'LearnFlow (Demo)',
      is_demo: true,
      demo_scenario: 'online_school',
    });

    // Fire-and-forget seeding — do not await, return the project immediately
    this.demoSeedService.seed(project.id, 'online_school', user.user_id).catch(() => {
      // Seeding is best-effort; errors are logged inside DemoSeedService
    });

    return project as any;
  }

  @Put(':id')
  async update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateProjectDto): Promise<ProjectDto> {
    return this.projectsService.update(user.user_id, id, body) as any;
  }

  @Delete(':id')
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.projectsService.remove(user.user_id, id);
  }
}
