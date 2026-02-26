import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { ProjectsService } from '../../projects/projects.service';
import { InsufficientPermissionsException } from '../../exceptions/insufficient-permissions.exception';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { ResetDemoDto, ResetDemoResponseDto } from '../dto/demo.dto';

@ApiTags('Demo')
@ApiBearerAuth()
@Controller('api/projects/:projectSlug/demo')
export class DemoController {
  constructor(
    private readonly demoSeedService: DemoSeedService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post('reset')
  async reset(
    @Param('projectSlug') projectSlug: string,
    @Body() dto: ResetDemoDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResetDemoResponseDto> {
    const project = await this.projectsService.getBySlug(user.user_id, projectSlug);

    if (project.role === 'viewer') {
      throw new InsufficientPermissionsException();
    }

    const scenario = dto.scenario ?? project.demo_scenario ?? 'online_school';
    const { count } = await this.demoSeedService.reset(project.id, scenario, user.user_id, project.is_demo);

    return { seeded_events: count, scenario };
  }
}
