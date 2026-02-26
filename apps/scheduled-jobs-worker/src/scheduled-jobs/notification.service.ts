import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  BaseNotificationService,
  type SlackChannelConfig,
  type EmailChannelConfig,
} from '@qurvo/nestjs-infra';

export type { SlackChannelConfig, EmailChannelConfig };

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

    const config = channelConfig as unknown;

    if (channelType === 'slack') {
      await this.sendSlack(config as SlackChannelConfig, message);
    } else if (channelType === 'email') {
      const emailConfig = config as EmailChannelConfig;
      const subject = `Qurvo Scheduled Analysis: "${jobName}"`;
      await this.sendEmail(emailConfig, subject, message);
      this.logger.debug({ to: emailConfig.email }, 'Scheduled job result email sent');
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
}
