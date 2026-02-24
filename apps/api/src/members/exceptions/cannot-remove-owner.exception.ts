import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';

export class CannotRemoveOwnerException extends AppForbiddenException {
  constructor(message = 'The project owner cannot be removed') {
    super(message);
    this.name = 'CannotRemoveOwnerException';
  }
}
