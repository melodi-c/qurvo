import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class InsightNotFoundException extends AppNotFoundException {
  constructor(message = 'Insight not found') {
    super(message);
    this.name = 'InsightNotFoundException';
  }
}
