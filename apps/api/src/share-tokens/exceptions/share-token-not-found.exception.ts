import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ShareTokenNotFoundException extends AppNotFoundException {
  constructor(message = 'Share token not found or expired') {
    super(message);
    this.name = 'ShareTokenNotFoundException';
  }
}
