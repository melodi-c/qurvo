import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const eventProperties = pgTable('event_properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  event_name: varchar('event_name', { length: 500 }).notNull(),
  property_name: varchar('property_name', { length: 500 }).notNull(),
  property_type: varchar('property_type', { length: 20 }).notNull(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('event_properties_unique_idx').on(table.project_id, table.event_name, table.property_name, table.property_type),
  index('event_properties_project_event_idx').on(table.project_id, table.event_name),
]);
