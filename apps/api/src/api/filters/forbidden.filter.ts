import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ProjectAccessDeniedException } from '../../projects/exceptions/project-access-denied.exception';
import { InsufficientPermissionsException } from '../../projects/exceptions/insufficient-permissions.exception';
import { ApiKeyPermissionException } from '../../api-keys/exceptions/insufficient-permissions.exception';

@Catch(ProjectAccessDeniedException, InsufficientPermissionsException, ApiKeyPermissionException)
export class ForbiddenFilter implements ExceptionFilter {
  catch(exception: ProjectAccessDeniedException | InsufficientPermissionsException | ApiKeyPermissionException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.FORBIDDEN).json({
      statusCode: HttpStatus.FORBIDDEN,
      message: exception.message,
    });
  }
}
