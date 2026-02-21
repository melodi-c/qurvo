import { pgTable, uuid, varchar, timestamp, date, numeric, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';
import { marketingChannels } from './marketing-channels';

export const adSpend = pgTable('ad_spend', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  channel_id: uuid('channel_id').notNull().references(() => marketingChannels.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  spend_date: date('spend_date').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  note: varchar('note', { length: 500 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ad_spend_project_channel_date_idx').on(table.project_id, table.channel_id, table.spend_date),
  index('ad_spend_project_date_idx').on(table.project_id, table.spend_date),
]);
