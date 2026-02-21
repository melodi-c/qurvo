import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ProjectAccessDeniedException } from '../../projects/exceptions/project-access-denied.exception';
import { InsufficientPermissionsException } from '../../projects/exceptions/insufficient-permissions.exception';
import { ApiKeyPermissionException } from '../../api-keys/exceptions/insufficient-permissions.exception';
import { CannotRemoveOwnerException } from '../../members/exceptions/cannot-remove-owner.exception';

@Catch(ProjectAccessDeniedException, InsufficientPermissionsException, ApiKeyPermissionException, CannotRemoveOwnerException)
export class ForbiddenFilter implements ExceptionFilter {
  catch(exception: ProjectAccessDeniedException | InsufficientPermissionsException | ApiKeyPermissionException | CannotRemoveOwnerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.FORBIDDEN).send({
      statusCode: HttpStatus.FORBIDDEN,
      message: exception.message,
    });
  }
}
