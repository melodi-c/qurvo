import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

export function createHttpFilter(
  status: HttpStatus,
  ...exceptions: Type<Error>[]
): Type<ExceptionFilter> {
  @Catch(...exceptions)
  class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: Error, host: ArgumentsHost) {
      const response = host.switchToHttp().getResponse<FastifyReply>();
      response.status(status).send({
        statusCode: status,
        message: exception.message,
      });
    }
  }
  return HttpExceptionFilter;
}
