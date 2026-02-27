import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { ProjectsService } from '../../projects/projects.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { RequireRole } from '../decorators/require-role.decorator';
import { ResetDemoDto, ResetDemoResponseDto } from '../dto/demo.dto';

@ApiTags('Demo')
@ApiBearerAuth()
@Controller('api/projects/:projectId/demo')
@UseGuards(ProjectMemberGuard)
export class DemoController {
  constructor(
    private readonly demoSeedService: DemoSeedService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post('reset')
  @RequireRole('editor')
  async reset(
    @Param('projectId') projectId: string,
    @Body() dto: ResetDemoDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResetDemoResponseDto> {
    const project = await this.projectsService.getById(user.user_id, projectId);

    const scenario = dto.scenario ?? project.demo_scenario ?? 'online_school';
    const { count } = await this.demoSeedService.reset(project.id, scenario, user.user_id, project.is_demo);

    return { seeded_events: count, scenario };
  }
}
