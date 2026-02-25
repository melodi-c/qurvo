export class AppNotFoundException extends Error {
  readonly isSafeForAi = true;

  constructor(message = 'Not found') {
    super(message);
    this.name = 'AppNotFoundException';
  }
}
