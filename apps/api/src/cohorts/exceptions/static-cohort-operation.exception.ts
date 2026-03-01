import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

export class StaticCohortOperationException extends AppBadRequestException {
  constructor(message = 'This operation is not supported for this cohort type') {
    super(message);
    this.name = 'StaticCohortOperationException';
  }
}
