import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { VerificationCooldownException } from '../../verification/exceptions/verification-cooldown.exception';

@Catch(VerificationCooldownException)
export class VerificationCooldownFilter implements ExceptionFilter {
  catch(exception: VerificationCooldownException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.TOO_MANY_REQUESTS).send({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: exception.message,
      seconds_remaining: exception.secondsRemaining,
    });
  }
}
