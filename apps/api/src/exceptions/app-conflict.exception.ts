export class AppConflictException extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'AppConflictException';
  }
}
