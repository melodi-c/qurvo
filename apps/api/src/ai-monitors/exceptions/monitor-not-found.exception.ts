import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class MonitorNotFoundException extends AppNotFoundException {
  constructor(message = 'Monitor not found') {
    super(message);
    this.name = 'MonitorNotFoundException';
  }
}
