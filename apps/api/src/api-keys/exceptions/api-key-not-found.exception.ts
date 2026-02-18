export class ApiKeyNotFoundException extends Error {
  constructor(message = 'API key not found') {
    super(message);
    this.name = 'ApiKeyNotFoundException';
  }
}
