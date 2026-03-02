import { pgEnum } from 'drizzle-orm/pg-core';

export const notificationChannelTypeEnum = pgEnum('notification_channel_type', [
  'slack',
  'email',
  'telegram',
]);

export type NotificationChannelType = (typeof notificationChannelTypeEnum.enumValues)[number];

export const annotationScopeEnum = pgEnum('annotation_scope', [
  'project',
  'insight',
]);

export type AnnotationScope = (typeof annotationScopeEnum.enumValues)[number];
