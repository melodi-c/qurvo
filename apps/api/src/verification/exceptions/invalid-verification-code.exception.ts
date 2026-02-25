import { AppUnprocessableEntityException } from '../../exceptions/app-unprocessable-entity.exception';

export class InvalidVerificationCodeException extends AppUnprocessableEntityException {
  constructor(message = 'Invalid or expired verification code') {
    super(message);
    this.name = 'InvalidVerificationCodeException';
  }
}
