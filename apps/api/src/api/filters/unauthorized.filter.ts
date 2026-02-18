import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { InvalidCredentialsException } from '../../auth/exceptions/invalid-credentials.exception';
import { InvalidSessionException } from '../../auth/exceptions/invalid-session.exception';

@Catch(InvalidCredentialsException, InvalidSessionException)
export class UnauthorizedFilter implements ExceptionFilter {
  catch(exception: InvalidCredentialsException | InvalidSessionException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.UNAUTHORIZED).json({
      statusCode: HttpStatus.UNAUTHORIZED,
      message: exception.message,
    });
  }
}
