export class AiNotConfiguredException extends Error {
  constructor(message = 'AI assistant is not configured. Set OPENAI_API_KEY environment variable.') {
    super(message);
    this.name = 'AiNotConfiguredException';
  }
}
