import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

export class CohortCsvParseException extends AppBadRequestException {
  constructor(message = 'Failed to parse cohort CSV') {
    super(message);
    this.name = 'CohortCsvParseException';
  }
}
