export class ApiKeyPermissionException extends Error {
  constructor(message = 'Insufficient permissions to manage API keys') {
    super(message);
    this.name = 'ApiKeyPermissionException';
  }
}
