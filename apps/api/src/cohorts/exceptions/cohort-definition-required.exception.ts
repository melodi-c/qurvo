import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

export class CohortDefinitionRequiredException extends AppBadRequestException {
  constructor(message = 'definition is required for dynamic cohorts') {
    super(message);
    this.name = 'CohortDefinitionRequiredException';
  }
}
