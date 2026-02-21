import { pgTable, pgEnum, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

export const channelTypeEnum = pgEnum('channel_type', [
  'manual',
  'google_ads',
  'facebook_ads',
  'tiktok_ads',
  'custom_api',
]);

export const marketingChannels = pgTable('marketing_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  channel_type: channelTypeEnum('channel_type').notNull().default('manual'),
  integration_config: jsonb('integration_config'),
  filter_conditions: jsonb('filter_conditions').default([]).$type<Array<{property: string; value: string}>>(),
  color: varchar('color', { length: 7 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('marketing_channels_project_id_idx').on(table.project_id),
]);
