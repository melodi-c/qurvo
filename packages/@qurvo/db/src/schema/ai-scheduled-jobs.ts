import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

export const aiScheduledJobs = pgTable('ai_scheduled_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  schedule: varchar('schedule', { length: 20 }).notNull(), // 'daily' | 'weekly' | 'monthly'
  channel_type: varchar('channel_type', { length: 20 }).notNull(), // 'slack' | 'email'
  channel_config: text('channel_config').notNull(), // JSON stored as text
  is_active: boolean('is_active').notNull().default(true),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AiScheduledJob = typeof aiScheduledJobs.$inferSelect;
export type InsertAiScheduledJob = typeof aiScheduledJobs.$inferInsert;
