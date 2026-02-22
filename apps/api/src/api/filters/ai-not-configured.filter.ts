import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AiNotConfiguredException } from '../../ai/exceptions/ai-not-configured.exception';

@Catch(AiNotConfiguredException)
export class AiNotConfiguredFilter implements ExceptionFilter {
  catch(exception: AiNotConfiguredException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.NOT_IMPLEMENTED).send({
      statusCode: HttpStatus.NOT_IMPLEMENTED,
      message: exception.message,
    });
  }
}
