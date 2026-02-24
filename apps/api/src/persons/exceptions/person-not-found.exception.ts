import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class PersonNotFoundException extends AppNotFoundException {
  constructor(message = 'Person not found') {
    super(message);
    this.name = 'PersonNotFoundException';
  }
}
