import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { WrongPasswordException } from '../../auth/exceptions/wrong-password.exception';

@Catch(WrongPasswordException)
export class WrongPasswordFilter implements ExceptionFilter {
  catch(exception: WrongPasswordException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.UNPROCESSABLE_ENTITY).send({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message: exception.message,
    });
  }
}
