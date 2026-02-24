import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class MemberNotFoundException extends AppNotFoundException {
  constructor(message = 'Member not found') {
    super(message);
    this.name = 'MemberNotFoundException';
  }
}
