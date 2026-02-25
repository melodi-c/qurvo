export class TooManyRequestsException extends Error {
  readonly retryAfter: number;

  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message);
    this.name = 'TooManyRequestsException';
    this.retryAfter = retryAfter;
  }
}
