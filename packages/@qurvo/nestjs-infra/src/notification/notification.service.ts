import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SlackChannelConfig {
  webhook_url: string;
}

export interface EmailChannelConfig {
  email: string;
}

export interface TelegramChannelConfig {
  chat_id: string;
  bot_token: string;
}

@Injectable()
export abstract class BaseNotificationService implements OnModuleInit {
  protected transporter?: Transporter;

  constructor(
    @InjectPinoLogger(BaseNotificationService.name) protected readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: process.env.SMTP_SECURE !== 'false',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  protected async sendSlack(config: SlackChannelConfig, text: string): Promise<void> {
    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      this.logger.warn(
        { status: response.status },
        'Slack webhook delivery failed',
      );
    }
  }

  protected async sendTelegram(config: TelegramChannelConfig, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chat_id, text, parse_mode: 'HTML' }),
    });
    if (!response.ok) {
      this.logger.warn({ status: response.status }, 'Telegram notification delivery failed');
    }
  }

  protected async sendEmail(
    config: EmailChannelConfig,
    subject: string,
    text: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('SMTP not configured, skipping email notification');
      return;
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await this.transporter.sendMail({
      from,
      to: config.email,
      subject,
      text,
      html: `<pre style="font-family:monospace">${text.replace(/\n/g, '<br>')}</pre>`,
    });
    this.logger.debug({ to: config.email }, 'Email notification sent');
  }
}
