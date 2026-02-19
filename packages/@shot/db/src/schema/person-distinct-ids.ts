import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { persons } from './persons';

export const personDistinctIds = pgTable(
  'person_distinct_ids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    person_id: uuid('person_id')
      .notNull()
      .references(() => persons.id, { onDelete: 'cascade' }),
    distinct_id: varchar('distinct_id', { length: 400 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('person_distinct_ids_project_distinct_idx').on(table.project_id, table.distinct_id),
    index('person_distinct_ids_person_id_idx').on(table.person_id),
  ],
);
