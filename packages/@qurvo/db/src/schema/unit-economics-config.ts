import { pgTable, uuid, varchar, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

export const unitEconomicsConfig = pgTable('unit_economics_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  purchase_event_name: varchar('purchase_event_name', { length: 200 }),
  revenue_property: varchar('revenue_property', { length: 200 }).notNull().default('revenue'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  churn_window_days: integer('churn_window_days').notNull().default(30),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('unit_economics_config_project_id_idx').on(table.project_id),
]);
