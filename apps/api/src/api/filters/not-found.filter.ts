import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ProjectNotFoundException } from '../../projects/exceptions/project-not-found.exception';
import { ApiKeyNotFoundException } from '../../api-keys/exceptions/api-key-not-found.exception';

@Catch(ProjectNotFoundException, ApiKeyNotFoundException)
export class NotFoundFilter implements ExceptionFilter {
  catch(exception: ProjectNotFoundException | ApiKeyNotFoundException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      message: exception.message,
    });
  }
}
