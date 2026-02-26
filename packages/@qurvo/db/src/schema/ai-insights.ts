import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export type AiInsightType = 'metric_change' | 'new_event' | 'retention_anomaly' | 'conversion_correlation';

export const aiInsights = pgTable('ai_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull().$type<AiInsightType>(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description').notNull(),
  data_json: jsonb('data_json'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  dismissed_at: timestamp('dismissed_at', { withTimezone: true }),
}, (table) => [
  index('ai_insights_project_id_created_at_idx').on(table.project_id, table.created_at),
]);
