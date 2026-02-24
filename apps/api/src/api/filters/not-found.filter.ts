import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

@Catch(AppNotFoundException)
export class NotFoundFilter implements ExceptionFilter {
  catch(exception: AppNotFoundException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.NOT_FOUND).send({
      statusCode: HttpStatus.NOT_FOUND,
      message: exception.message,
    });
  }
}
