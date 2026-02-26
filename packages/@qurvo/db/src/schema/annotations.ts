import { pgTable, uuid, varchar, date, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

export const annotations = pgTable('annotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  date: date('date').notNull(),
  label: varchar('label', { length: 200 }).notNull(),
  description: varchar('description', { length: 1000 }),
  color: varchar('color', { length: 20 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('annotations_project_id_date_idx').on(table.project_id, table.date),
]);
