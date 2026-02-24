import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class DashboardNotFoundException extends AppNotFoundException {
  constructor(message = 'Dashboard not found') {
    super(message);
    this.name = 'DashboardNotFoundException';
  }
}
