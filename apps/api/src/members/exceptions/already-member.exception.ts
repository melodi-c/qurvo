export class AlreadyMemberException extends Error {
  constructor(message = 'This user is already a member of the project') {
    super(message);
    this.name = 'AlreadyMemberException';
  }
}
