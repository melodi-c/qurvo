import { AppConflictException } from '../../exceptions/app-conflict.exception';

export class InviteConflictException extends AppConflictException {
  constructor(message = 'A pending invite already exists for this email') {
    super(message);
    this.name = 'InviteConflictException';
  }
}
