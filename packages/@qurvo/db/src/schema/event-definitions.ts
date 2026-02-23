import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const eventDefinitions = pgTable('event_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  event_name: varchar('event_name', { length: 500 }).notNull(),
  description: varchar('description', { length: 1000 }),
  tags: text('tags').array().notNull().default([]),
  verified: boolean('verified').notNull().default(false),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('event_definitions_project_name_idx').on(table.project_id, table.event_name),
  index('event_definitions_project_id_idx').on(table.project_id),
]);
