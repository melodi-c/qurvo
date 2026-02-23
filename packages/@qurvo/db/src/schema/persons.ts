import { pgTable, uuid, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey(), // Same UUID as person_id in ClickHouse events (provided by PersonResolverService)
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    properties: jsonb('properties').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('persons_project_id_idx').on(table.project_id),
    index('persons_project_updated_at_idx').on(table.project_id, table.updated_at),
    index('persons_properties_gin_idx').using('gin', table.properties),
  ],
);
