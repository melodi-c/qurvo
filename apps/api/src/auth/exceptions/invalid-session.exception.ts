export class InvalidSessionException extends Error {
  constructor(message = 'Invalid or expired session') {
    super(message);
    this.name = 'InvalidSessionException';
  }
}
