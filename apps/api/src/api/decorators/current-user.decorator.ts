import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  language: string;
  email_verified: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
