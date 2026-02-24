export class AppNotFoundException extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'AppNotFoundException';
  }
}
