import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AiMonitor } from '@qurvo/db';
import {
  BaseNotificationService,
  type SlackChannelConfig,
  type EmailChannelConfig,
  type TelegramChannelConfig,
} from '@qurvo/nestjs-infra';

export type { SlackChannelConfig, EmailChannelConfig, TelegramChannelConfig };

@Injectable()
export class NotificationService extends BaseNotificationService {
  constructor(
    @InjectPinoLogger(NotificationService.name) protected readonly logger: PinoLogger,
  ) {
    super(logger);
  }

  async send(
    monitor: AiMonitor,
    description: string,
    current: number,
    baselineAvg: number,
  ): Promise<void> {
    const message = this.buildMessage(monitor, description, current, baselineAvg);
    const config = monitor.channel_config as unknown;

    if (monitor.channel_type === 'slack') {
      await this.sendSlack(config as SlackChannelConfig, message);
    } else if (monitor.channel_type === 'email') {
      const emailConfig = config as EmailChannelConfig;
      const subject = `Qurvo Alert: Anomaly in "${monitor.event_name}"`;
      await this.sendEmail(emailConfig, subject, message);
      this.logger.debug({ to: emailConfig.email }, 'Alert email sent');
    } else if (monitor.channel_type === 'telegram') {
      await this.sendTelegram(config as TelegramChannelConfig, message);
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
}
