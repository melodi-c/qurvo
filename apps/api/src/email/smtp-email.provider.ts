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
      subject: 'Подтвердите email — Qurvo',
      html: this.buildHtml(code, verifyUrl),
      text: `Ваш код подтверждения: ${code}\n\nИли перейдите по ссылке: ${verifyUrl}\n\nКод действителен 10 минут.`,
    });

    this.logger.log({ to }, 'Verification email sent');
  }

  private buildHtml(code: string, verifyUrl: string): string {
    const digits = code.split('').join(' &nbsp; ');
    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                  max-width:480px;margin:0 auto;padding:40px 24px;color:#18181b">
        <div style="text-align:center;margin-bottom:32px">
          <span style="font-size:20px;font-weight:700;letter-spacing:-0.5px">Qurvo</span>
        </div>
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:600">Подтвердите email</h2>
        <p style="color:#71717a;margin:0 0 24px;font-size:15px;line-height:1.5">
          Введите этот код в приложении для подтверждения аккаунта:
        </p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;
                    padding:20px 24px;background:#18181b;border-radius:12px;color:#fafafa">
          ${digits}
        </div>
        <div style="text-align:center;margin-top:24px">
          <a href="${verifyUrl}"
             style="display:inline-block;padding:12px 32px;background:#18181b;color:#fafafa;
                    text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">
            Подтвердить автоматически
          </a>
        </div>
        <p style="color:#a1a1aa;font-size:13px;margin-top:32px;text-align:center;line-height:1.5">
          Код действителен 10 минут.<br>
          Если вы не регистрировались в Qurvo, проигнорируйте это письмо.
        </p>
      </div>
    `;
  }
}
