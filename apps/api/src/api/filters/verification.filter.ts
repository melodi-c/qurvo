import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { InvalidVerificationCodeException } from '../../verification/exceptions/invalid-verification-code.exception';
import { VerificationCooldownException } from '../../verification/exceptions/verification-cooldown.exception';

@Catch(InvalidVerificationCodeException, VerificationCooldownException)
export class VerificationFilter implements ExceptionFilter {
  catch(exception: InvalidVerificationCodeException | VerificationCooldownException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof VerificationCooldownException) {
      response.status(HttpStatus.TOO_MANY_REQUESTS).send({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: exception.message,
        seconds_remaining: exception.secondsRemaining,
      });
      return;
    }

    response.status(HttpStatus.UNPROCESSABLE_ENTITY).send({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message: exception.message,
    });
  }
}
