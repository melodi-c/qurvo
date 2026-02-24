import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class CohortNotFoundException extends AppNotFoundException {
  constructor(message = 'Cohort not found') {
    super(message);
    this.name = 'CohortNotFoundException';
  }
}
