export class InviteNotFoundException extends Error {
  constructor(message = 'Invite not found') {
    super(message);
    this.name = 'InviteNotFoundException';
  }
}
