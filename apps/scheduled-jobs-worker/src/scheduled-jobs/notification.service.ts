import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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

  async sendScheduledJobResult(
    jobName: string,
    prompt: string,
    result: string,
    channelType: string,
    channelConfig: Record<string, unknown>,
  ): Promise<void> {
    const message = this.buildMessage(jobName, prompt, result);
    const subject = `Qurvo Scheduled Analysis: "${jobName}"`;
    await this.dispatch(channelType, channelConfig, message, subject);
  }

  private buildMessage(jobName: string, prompt: string, result: string): string {
    return (
      `Scheduled AI Analysis: ${jobName}\n` +
      `Prompt: ${prompt}\n\n` +
      `Result:\n${result}`
    );
  }
}
