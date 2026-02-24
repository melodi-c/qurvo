import { AppUnauthorizedException } from '../../exceptions/app-unauthorized.exception';

export class InvalidCredentialsException extends AppUnauthorizedException {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsException';
  }
}
