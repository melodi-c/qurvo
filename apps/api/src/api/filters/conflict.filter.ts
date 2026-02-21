import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { EmailConflictException } from '../../auth/exceptions/email-conflict.exception';
import { ProjectNameConflictException } from '../../projects/exceptions/project-name-conflict.exception';
import { InviteConflictException } from '../../members/exceptions/invite-conflict.exception';
import { AlreadyMemberException } from '../../members/exceptions/already-member.exception';

@Catch(EmailConflictException, ProjectNameConflictException, InviteConflictException, AlreadyMemberException)
export class ConflictFilter implements ExceptionFilter {
  catch(exception: EmailConflictException | ProjectNameConflictException | InviteConflictException | AlreadyMemberException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      message: exception.message,
    });
  }
}
