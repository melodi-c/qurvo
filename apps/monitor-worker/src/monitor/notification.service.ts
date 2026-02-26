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
    const subject = `Qurvo Alert: Anomaly in "${monitor.event_name}"`;
    await this.dispatch(monitor.channel_type, monitor.channel_config as unknown, message, subject);
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
