import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectsService } from '../../projects/projects.service';
import { InsufficientPermissionsException } from '../../projects/exceptions/insufficient-permissions.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { REQUIRED_ROLE_KEY, type ProjectRole } from '../decorators/require-role.decorator';

const ROLE_LEVEL: Record<string, number> = { owner: 3, editor: 2, viewer: 1 };

@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const projectId: string | undefined =
      request.params?.projectId ?? request.query?.project_id;
    if (!projectId) throw new AppBadRequestException('projectId is required');

    const membership = await this.projectsService.getMembership(
      user.user_id,
      projectId,
    );

    const requiredRole = this.reflector.getAllAndOverride<
      ProjectRole | undefined
    >(REQUIRED_ROLE_KEY, [context.getHandler(), context.getClass()]);

    if (
      requiredRole &&
      ROLE_LEVEL[membership.role] < ROLE_LEVEL[requiredRole]
    ) {
      throw new InsufficientPermissionsException();
    }

    return true;
  }
}
