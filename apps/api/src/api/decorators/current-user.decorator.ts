import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SessionUserDto } from '../dto/auth.dto';

export type RequestUser = SessionUserDto;

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
