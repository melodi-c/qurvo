import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class WidgetNotFoundException extends AppNotFoundException {
  constructor(message = 'Widget not found') {
    super(message);
    this.name = 'WidgetNotFoundException';
  }
}
