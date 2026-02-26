import { pgTable, uuid, varchar, text, jsonb, integer, numeric, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull().default('New conversation'),
  is_shared: boolean('is_shared').notNull().default(false),
  history_summary: text('history_summary'),
  summary_failed: boolean('summary_failed').notNull().default(false),
  tokens_input: integer('tokens_input').notNull().default(0),
  tokens_output: integer('tokens_output').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ai_conversations_user_project_idx').on(table.user_id, table.project_id),
  index('ai_conversations_project_shared_idx').on(table.project_id, table.is_shared),
]);

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content'),
  tool_calls: jsonb('tool_calls'),
  tool_call_id: varchar('tool_call_id', { length: 100 }),
  tool_name: varchar('tool_name', { length: 100 }),
  tool_result: jsonb('tool_result'),
  visualization_type: varchar('visualization_type', { length: 50 }),
  sequence: integer('sequence').notNull(),
  prompt_tokens: integer('prompt_tokens'),
  completion_tokens: integer('completion_tokens'),
  model_used: varchar('model_used', { length: 100 }),
  estimated_cost_usd: numeric('estimated_cost_usd', { precision: 12, scale: 8 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ai_messages_conversation_seq_idx').on(table.conversation_id, table.sequence),
]);

export const aiMessageFeedback = pgTable('ai_message_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  message_id: uuid('message_id').notNull().references(() => aiMessages.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: varchar('rating', { length: 10 }).notNull(),
  comment: text('comment'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ai_message_feedback_message_user_idx').on(table.message_id, table.user_id),
]);
