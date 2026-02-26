import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ScheduledJobNotFoundException extends AppNotFoundException {
  constructor(message = 'Scheduled job not found') {
    super(message);
    this.name = 'ScheduledJobNotFoundException';
  }
}
