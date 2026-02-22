import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailProvider } from './email.provider.interface';

@Injectable()
export class SmtpEmailProvider implements EmailProvider, OnModuleInit {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private transporter!: Transporter;

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.yandex.ru',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    this.transporter.verify().catch((err) => {
      this.logger.warn({ err: err.message }, 'SMTP connection verification failed');
    });
  }

  async sendEmailVerification(to: string, code: string, verifyUrl: string): Promise<void> {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Verify your Qurvo account',
      html: this.buildHtml(code, verifyUrl),
      text: `Your verification code is: ${code}\n\nOr click here to verify: ${verifyUrl}\n\nThis code expires in 10 minutes.`,
    });

    this.logger.log({ to }, 'Verification email sent');
  }

  private buildHtml(code: string, verifyUrl: string): string {
    return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="margin-bottom:8px">Verify your email</h2>
        <p style="color:#71717a;margin-bottom:24px">Enter this code in the app to confirm your account:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;
                    padding:24px;background:#18181b;border-radius:8px;color:#fafafa">
          ${code}
        </div>
        <p style="margin-top:24px;color:#71717a;font-size:14px">
          Or <a href="${verifyUrl}" style="color:#fafafa">click here to verify automatically</a>.
        </p>
        <p style="color:#52525b;font-size:12px;margin-top:16px">This code expires in 10 minutes.</p>
      </div>
    `;
  }
}
