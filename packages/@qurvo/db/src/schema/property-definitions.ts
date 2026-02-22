import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const propertyDefinitions = pgTable('property_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  property_name: varchar('property_name', { length: 500 }).notNull(),
  property_type: varchar('property_type', { length: 20 }).notNull().default('event'),
  description: varchar('description', { length: 1000 }),
  tags: text('tags').array().notNull().default([]),
  verified: boolean('verified').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('property_definitions_project_name_type_idx').on(table.project_id, table.property_name, table.property_type),
  index('property_definitions_project_id_idx').on(table.project_id),
]);
