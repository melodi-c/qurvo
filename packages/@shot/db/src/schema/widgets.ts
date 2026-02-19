import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { dashboards } from './dashboards';

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboard_id: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    config: jsonb('config').notNull(),
    layout: jsonb('layout').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('widgets_dashboard_id_idx').on(table.dashboard_id)],
);
