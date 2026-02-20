import { pgTable, uuid, varchar, timestamp, text, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  key_prefix: varchar('key_prefix', { length: 16 }).notNull(),
  key_hash: varchar('key_hash', { length: 64 }).notNull().unique(),
  scopes: text('scopes').array().notNull().default([]),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('api_keys_project_id_idx').on(table.project_id),
  index('api_keys_key_hash_idx').on(table.key_hash),
]);
