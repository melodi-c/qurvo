export class CannotRemoveOwnerException extends Error {
  constructor(message = 'The project owner cannot be removed') {
    super(message);
    this.name = 'CannotRemoveOwnerException';
  }
}
