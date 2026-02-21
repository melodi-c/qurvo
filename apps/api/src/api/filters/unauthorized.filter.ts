import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { InvalidCredentialsException } from '../../auth/exceptions/invalid-credentials.exception';
import { InvalidSessionException } from '../../auth/exceptions/invalid-session.exception';

@Catch(InvalidCredentialsException, InvalidSessionException)
export class UnauthorizedFilter implements ExceptionFilter {
  catch(exception: InvalidCredentialsException | InvalidSessionException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.UNAUTHORIZED).send({
      statusCode: HttpStatus.UNAUTHORIZED,
      message: exception.message,
    });
  }
}
