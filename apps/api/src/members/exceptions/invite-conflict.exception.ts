export class InviteConflictException extends Error {
  constructor(message = 'A pending invite already exists for this email') {
    super(message);
    this.name = 'InviteConflictException';
  }
}
