export class WrongPasswordException extends Error {
  constructor(message = 'Current password is incorrect') {
    super(message);
    this.name = 'WrongPasswordException';
  }
}
