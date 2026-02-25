import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class MessageFeedbackNotFoundException extends AppNotFoundException {
  constructor(message = 'Feedback not found') {
    super(message);
    this.name = 'MessageFeedbackNotFoundException';
  }
}
