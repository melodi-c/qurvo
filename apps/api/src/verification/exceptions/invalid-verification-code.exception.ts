export class InvalidVerificationCodeException extends Error {
  constructor(message = 'Invalid or expired verification code') {
    super(message);
    this.name = 'InvalidVerificationCodeException';
  }
}
