import { AppConflictException } from '../../exceptions/app-conflict.exception';

export class ProjectNameConflictException extends AppConflictException {
  constructor(message = 'Project name already taken') {
    super(message);
    this.name = 'ProjectNameConflictException';
  }
}
