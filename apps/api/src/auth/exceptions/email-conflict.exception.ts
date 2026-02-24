import { AppConflictException } from '../../exceptions/app-conflict.exception';

export class EmailConflictException extends AppConflictException {
  constructor(message = 'Email already registered') {
    super(message);
    this.name = 'EmailConflictException';
  }
}
