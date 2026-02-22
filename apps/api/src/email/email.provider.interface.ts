export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailProvider {
  sendEmailVerification(to: string, code: string, verifyUrl: string): Promise<void>;
}
