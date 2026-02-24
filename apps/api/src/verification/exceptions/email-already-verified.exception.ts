import { AppConflictException } from '../../exceptions/app-conflict.exception';

export class EmailAlreadyVerifiedException extends AppConflictException {
  constructor(message = 'Email is already verified') {
    super(message);
    this.name = 'EmailAlreadyVerifiedException';
  }
}
