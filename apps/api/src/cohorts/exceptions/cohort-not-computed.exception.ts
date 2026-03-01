import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

export class CohortNotComputedException extends AppBadRequestException {
  constructor(message = 'Cohort has not been computed yet') {
    super(message);
    this.name = 'CohortNotComputedException';
  }
}
