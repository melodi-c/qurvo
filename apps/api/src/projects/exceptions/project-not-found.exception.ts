import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ProjectNotFoundException extends AppNotFoundException {
  constructor(message = 'Project not found') {
    super(message);
    this.name = 'ProjectNotFoundException';
  }
}
