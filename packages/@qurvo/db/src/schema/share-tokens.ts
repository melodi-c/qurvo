import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

export type ShareTokenResourceType = 'dashboard' | 'insight';

export const shareTokens = pgTable(
  'share_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: varchar('token', { length: 64 }).notNull(),
    resource_type: varchar('resource_type', { length: 20 }).notNull().$type<ShareTokenResourceType>(),
    resource_id: uuid('resource_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('share_tokens_token_idx').on(table.token),
    index('share_tokens_resource_idx').on(table.project_id, table.resource_type, table.resource_id),
  ],
);
