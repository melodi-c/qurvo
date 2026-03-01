import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

export class CircularCohortReferenceException extends AppBadRequestException {
  constructor(message = 'Circular cohort reference detected') {
    super(message);
    this.name = 'CircularCohortReferenceException';
  }
}
