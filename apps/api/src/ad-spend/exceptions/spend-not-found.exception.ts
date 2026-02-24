import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class SpendNotFoundException extends AppNotFoundException {
  constructor(message = 'Ad spend record not found') {
    super(message);
    this.name = 'SpendNotFoundException';
  }
}
