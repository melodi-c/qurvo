export class TooManyRequestsException extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'TooManyRequestsException';
  }
}
