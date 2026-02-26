import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AiMonitor } from '@qurvo/db';

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

  async send(
    monitor: AiMonitor,
    description: string,
    current: number,
    baselineAvg: number,
  ): Promise<void> {
    const message = this.buildMessage(monitor, description, current, baselineAvg);

    if (monitor.channel_type === 'slack') {
      await this.sendSlack(monitor.channel_config as SlackChannelConfig, message);
    } else if (monitor.channel_type === 'email') {
      await this.sendEmail(monitor.channel_config as EmailChannelConfig, monitor, message);
    } else {
      this.logger.warn({ channel_type: monitor.channel_type }, 'Unknown channel type');
    }
  }

  private buildMessage(
    monitor: AiMonitor,
    description: string,
    current: number,
    baselineAvg: number,
  ): string {
    const changePercent = baselineAvg > 0
      ? Math.round(((current - baselineAvg) / baselineAvg) * 100)
      : 0;
    const direction = current > baselineAvg ? 'increased' : 'decreased';
    return (
      `Anomaly detected for event "${monitor.event_name}" (${monitor.metric})\n` +
      `Current: ${current} | Baseline avg: ${Math.round(baselineAvg)} | Change: ${changePercent}% ${direction}\n` +
      `\n${description}`
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
    monitor: AiMonitor,
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
      subject: `Qurvo Alert: Anomaly in "${monitor.event_name}"`,
      text,
      html: `<pre style="font-family:monospace">${text.replace(/\n/g, '<br>')}</pre>`,
    });
    this.logger.debug({ to: config.email }, 'Alert email sent');
  }
}
