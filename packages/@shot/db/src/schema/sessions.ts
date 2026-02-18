import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token_hash: varchar('token_hash', { length: 64 }).notNull().unique(),
  ip_address: varchar('ip_address', { length: 45 }),
  user_agent: varchar('user_agent', { length: 500 }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sessions_token_hash_idx').on(table.token_hash),
  index('sessions_user_id_idx').on(table.user_id),
]);
