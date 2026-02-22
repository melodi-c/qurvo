import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { EmailConflictException } from '../../auth/exceptions/email-conflict.exception';
import { ProjectNameConflictException } from '../../projects/exceptions/project-name-conflict.exception';
import { InviteConflictException } from '../../members/exceptions/invite-conflict.exception';
import { AlreadyMemberException } from '../../members/exceptions/already-member.exception';
import { EmailAlreadyVerifiedException } from '../../verification/exceptions/email-already-verified.exception';

@Catch(EmailConflictException, ProjectNameConflictException, InviteConflictException, AlreadyMemberException, EmailAlreadyVerifiedException)
export class ConflictFilter implements ExceptionFilter {
  catch(exception: EmailConflictException | ProjectNameConflictException | InviteConflictException | AlreadyMemberException | EmailAlreadyVerifiedException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.CONFLICT).send({
      statusCode: HttpStatus.CONFLICT,
      message: exception.message,
    });
  }
}
