import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class MessageNotFoundException extends AppNotFoundException {
  constructor(message = 'Message not found') {
    super(message);
    this.name = 'MessageNotFoundException';
  }
}
