export class AiQuotaExceededException extends Error {
  constructor(message = 'AI message quota exceeded. Upgrade your plan to continue.') {
    super(message);
    this.name = 'AiQuotaExceededException';
  }
}
