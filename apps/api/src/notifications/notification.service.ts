import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  BaseNotificationService,
  isSlackConfig,
  isEmailConfig,
  isTelegramConfig,
} from '@qurvo/nestjs-infra';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';

const TEST_MESSAGE = 'This is a test notification from Qurvo. Your channel is configured correctly.';
const TEST_SUBJECT = 'Qurvo — Test Notification';

@Injectable()
export class NotificationService extends BaseNotificationService {
  constructor(
    @InjectPinoLogger(NotificationService.name) protected readonly logger: PinoLogger,
  ) {
    super(logger);
  }

  async sendTest(channelType: string, channelConfig: Record<string, unknown>): Promise<void> {
    switch (channelType) {
      case 'slack':
        if (!isSlackConfig(channelConfig)) {
          throw new AppBadRequestException('Invalid Slack config: webhook_url is required');
        }
        await this.testSlackStrict(channelConfig.webhook_url);
        break;

      case 'email':
        if (!isEmailConfig(channelConfig)) {
          throw new AppBadRequestException('Invalid email config: email is required');
        }
        if (!this.transporter) {
          throw new AppBadRequestException('SMTP is not configured on this server');
        }
        await this.sendEmail(channelConfig, TEST_SUBJECT, TEST_MESSAGE);
        break;

      case 'telegram':
        if (!isTelegramConfig(channelConfig)) {
          throw new AppBadRequestException(
            'Invalid Telegram config: chat_id and bot_token are required',
          );
        }
        await this.testTelegramStrict(channelConfig.bot_token, channelConfig.chat_id);
        break;

      default:
        throw new AppBadRequestException(`Unknown channel type: ${channelType}`);
    }
  }

  private async testSlackStrict(webhookUrl: string): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: TEST_MESSAGE }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AppBadRequestException(
        `Slack delivery failed (HTTP ${response.status}): ${body || 'unknown error'}`,
      );
    }
  }

  private async testTelegramStrict(botToken: string, chatId: string): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: TEST_MESSAGE, parse_mode: 'HTML' }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const description = (body['description'] as string) || 'unknown error';
      throw new AppBadRequestException(
        `Telegram delivery failed (HTTP ${response.status}): ${description}`,
      );
    }
  }
}
