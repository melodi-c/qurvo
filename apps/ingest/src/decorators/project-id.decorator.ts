import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ProjectId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<{ projectId: string }>().projectId;
});
