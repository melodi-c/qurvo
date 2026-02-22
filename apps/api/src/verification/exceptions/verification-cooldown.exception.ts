export class VerificationCooldownException extends Error {
  constructor(public readonly secondsRemaining: number) {
    super(`Please wait ${secondsRemaining} seconds before requesting a new code`);
    this.name = 'VerificationCooldownException';
  }
}
