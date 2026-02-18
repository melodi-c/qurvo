export class InvalidCredentialsException extends Error {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsException';
  }
}
