import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ProjectMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().projectMembership;
  },
);
