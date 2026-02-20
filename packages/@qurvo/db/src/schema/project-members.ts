import { pgTable, uuid, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';

export const projectRoleEnum = pgEnum('project_role', ['owner', 'editor', 'viewer']);

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role').notNull().default('viewer'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_members_project_user_idx').on(table.project_id, table.user_id),
]);
