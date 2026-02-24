import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';

export class InsufficientPermissionsException extends AppForbiddenException {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'InsufficientPermissionsException';
  }
}
