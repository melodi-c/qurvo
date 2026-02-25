import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { TooManyRequestsException } from '../../exceptions/too-many-requests.exception';

@Catch(TooManyRequestsException)
export class TooManyRequestsFilter implements ExceptionFilter {
  catch(exception: TooManyRequestsException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .header('Retry-After', String(exception.retryAfter))
      .send({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: exception.message,
        retry_after: exception.retryAfter,
      });
  }
}
