export class AppUnprocessableEntityException extends Error {
  constructor(message = 'Unprocessable entity') {
    super(message);
    this.name = 'AppUnprocessableEntityException';
  }
}
