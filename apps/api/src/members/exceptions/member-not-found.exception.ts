export class MemberNotFoundException extends Error {
  constructor(message = 'Member not found') {
    super(message);
    this.name = 'MemberNotFoundException';
  }
}
