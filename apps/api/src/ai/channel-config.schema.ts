import { z } from 'zod';

export const slackChannelConfigSchema = z.object({
  webhook_url: z.string().url().describe('Slack incoming webhook URL'),
});

export const emailChannelConfigSchema = z.object({
  email: z.string().email().describe('Recipient email address'),
});

export const telegramChannelConfigSchema = z.object({
  bot_token: z.string().describe('Telegram bot token'),
  chat_id: z.string().describe('Telegram chat ID'),
});

export const channelConfigSchema = z.union([
  slackChannelConfigSchema,
  emailChannelConfigSchema,
  telegramChannelConfigSchema,
]);

export const channelConfigDescription =
  'Channel configuration. ' +
  'For slack: { webhook_url: string }. ' +
  'For email: { email: string }. ' +
  'For telegram: { bot_token: string, chat_id: string }.';
