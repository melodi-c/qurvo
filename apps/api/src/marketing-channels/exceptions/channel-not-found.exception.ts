import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ChannelNotFoundException extends AppNotFoundException {
  constructor(message = 'Marketing channel not found') {
    super(message);
    this.name = 'ChannelNotFoundException';
  }
}
