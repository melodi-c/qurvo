import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class EventNotFoundException extends AppNotFoundException {
  constructor(message = 'Event not found') {
    super(message);
    this.name = 'EventNotFoundException';
  }
}
