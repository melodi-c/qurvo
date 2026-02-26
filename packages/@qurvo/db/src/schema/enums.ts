import { pgEnum } from 'drizzle-orm/pg-core';

export const notificationChannelTypeEnum = pgEnum('notification_channel_type', [
  'slack',
  'email',
  'telegram',
]);

export type NotificationChannelType = (typeof notificationChannelTypeEnum.enumValues)[number];
