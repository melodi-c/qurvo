import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ConversationNotFoundException extends AppNotFoundException {
  constructor(message = 'Conversation not found') {
    super(message);
    this.name = 'ConversationNotFoundException';
  }
}
