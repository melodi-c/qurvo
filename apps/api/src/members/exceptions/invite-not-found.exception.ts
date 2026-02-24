import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class InviteNotFoundException extends AppNotFoundException {
  constructor(message = 'Invite not found') {
    super(message);
    this.name = 'InviteNotFoundException';
  }
}
