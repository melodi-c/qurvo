export class AppBadRequestException extends Error {
  constructor(message = 'Bad request') {
    super(message);
    this.name = 'AppBadRequestException';
  }
}
