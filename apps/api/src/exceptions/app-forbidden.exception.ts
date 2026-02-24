export class AppForbiddenException extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'AppForbiddenException';
  }
}
