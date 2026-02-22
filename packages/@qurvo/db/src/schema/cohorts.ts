import { pgTable, uuid, varchar, timestamp, jsonb, index, bigint } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

// ── Cohort definition types ──────────────────────────────────────────────────

export type CohortPropertyOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';
export type CohortCountOperator = 'gte' | 'lte' | 'eq';

export interface CohortPropertyCondition {
  type: 'person_property';
  property: string;
  operator: CohortPropertyOperator;
  value?: string;
}

export interface CohortEventCondition {
  type: 'event';
  event_name: string;
  count_operator: CohortCountOperator;
  count: number;
  time_window_days: number;
}

export type CohortCondition = CohortPropertyCondition | CohortEventCondition;

export interface CohortDefinition {
  match: 'all' | 'any';
  conditions: CohortCondition[];
}

// ── Table ────────────────────────────────────────────────────────────────────

export const cohorts = pgTable('cohorts', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: varchar('description', { length: 1000 }),
  definition: jsonb('definition').notNull().$type<CohortDefinition>(),
  membership_version: bigint('membership_version', { mode: 'number' }),
  membership_computed_at: timestamp('membership_computed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('cohorts_project_id_idx').on(table.project_id),
]);
