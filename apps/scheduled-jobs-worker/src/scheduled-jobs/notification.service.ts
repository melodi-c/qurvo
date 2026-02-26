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

@Injectable()
export class NotificationService implements OnModuleInit {
  private transporter?: Transporter;

  constructor(
    @InjectPinoLogger(NotificationService.name) private readonly logger: PinoLogger,
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

  async sendScheduledJobResult(
    jobName: string,
    prompt: string,
    result: string,
    channelType: string,
    channelConfig: Record<string, unknown>,
  ): Promise<void> {
    const message = this.buildMessage(jobName, prompt, result);

    if (channelType === 'slack') {
      await this.sendSlack(channelConfig as unknown as SlackChannelConfig, message);
    } else if (channelType === 'email') {
      await this.sendEmail(channelConfig as unknown as EmailChannelConfig, jobName, message);
    } else {
      this.logger.warn({ channel_type: channelType }, 'Unknown channel type');
    }
  }

  private buildMessage(jobName: string, prompt: string, result: string): string {
    return (
      `Scheduled AI Analysis: ${jobName}\n` +
      `Prompt: ${prompt}\n\n` +
      `Result:\n${result}`
    );
  }

  private async sendSlack(config: SlackChannelConfig, text: string): Promise<void> {
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

  private async sendEmail(
    config: EmailChannelConfig,
    jobName: string,
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
      subject: `Qurvo Scheduled Analysis: "${jobName}"`,
      text,
      html: `<pre style="font-family:monospace">${text.replace(/\n/g, '<br>')}</pre>`,
    });
    this.logger.debug({ to: config.email }, 'Scheduled job result email sent');
  }
}
