export class AppBadRequestException extends Error {
  readonly isSafeForAi = true;

  constructor(message = 'Bad request') {
    super(message);
    this.name = 'AppBadRequestException';
  }
}
