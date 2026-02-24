import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

export class ApiKeyNotFoundException extends AppNotFoundException {
  constructor(message = 'API key not found') {
    super(message);
    this.name = 'ApiKeyNotFoundException';
  }
}
