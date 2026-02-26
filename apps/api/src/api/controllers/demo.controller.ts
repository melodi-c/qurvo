import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { ProjectsService } from '../../projects/projects.service';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
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

    if (!project.is_demo) {
      throw new AppForbiddenException('This endpoint is only available for demo projects');
    }

    const scenario = dto.scenario ?? project.demo_scenario ?? 'online_school';
    const { count } = await this.demoSeedService.reset(project.id, scenario);

    return { seeded_events: count, scenario };
  }
}
