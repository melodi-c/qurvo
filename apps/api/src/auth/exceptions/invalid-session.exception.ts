import { AppUnauthorizedException } from '../../exceptions/app-unauthorized.exception';

export class InvalidSessionException extends AppUnauthorizedException {
  constructor(message = 'Invalid or expired session') {
    super(message);
    this.name = 'InvalidSessionException';
  }
}
