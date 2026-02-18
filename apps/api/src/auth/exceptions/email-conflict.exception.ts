export class EmailConflictException extends Error {
  constructor(message = 'Email already registered') {
    super(message);
    this.name = 'EmailConflictException';
  }
}
