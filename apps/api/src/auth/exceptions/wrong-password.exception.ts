import { AppUnprocessableEntityException } from '../../exceptions/app-unprocessable-entity.exception';

export class WrongPasswordException extends AppUnprocessableEntityException {
  constructor(message = 'Current password is incorrect') {
    super(message);
    this.name = 'WrongPasswordException';
  }
}
