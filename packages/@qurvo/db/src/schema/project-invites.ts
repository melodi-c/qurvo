import { pgTable, uuid, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';
import { projectRoleEnum } from './project-members';

export const inviteStatusEnum = pgEnum('invite_status', ['pending', 'accepted', 'declined', 'cancelled']);

export const projectInvites = pgTable('project_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  invited_by: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: projectRoleEnum('role').notNull().default('viewer'),
  status: inviteStatusEnum('status').notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  responded_at: timestamp('responded_at', { withTimezone: true }),
}, (table) => [
  index('project_invites_project_id_idx').on(table.project_id),
  index('project_invites_email_status_idx').on(table.email, table.status),
]);
