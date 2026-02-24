import { AppConflictException } from '../../exceptions/app-conflict.exception';

export class AlreadyMemberException extends AppConflictException {
  constructor(message = 'This user is already a member of the project') {
    super(message);
    this.name = 'AlreadyMemberException';
  }
}
