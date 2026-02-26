import { pgTable, uuid, varchar, doublePrecision, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { notificationChannelTypeEnum } from './enums';

export const aiMonitors = pgTable('ai_monitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  event_name: varchar('event_name', { length: 255 }).notNull(),
  metric: varchar('metric', { length: 50 }).notNull().default('count'),
  threshold_sigma: doublePrecision('threshold_sigma').notNull().default(2.0),
  channel_type: notificationChannelTypeEnum('channel_type').notNull(),
  channel_config: jsonb('channel_config').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AiMonitor = typeof aiMonitors.$inferSelect;
export type InsertAiMonitor = typeof aiMonitors.$inferInsert;
