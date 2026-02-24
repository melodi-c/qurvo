export class AppUnauthorizedException extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AppUnauthorizedException';
  }
}
