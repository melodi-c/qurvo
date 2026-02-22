import { pgTable, uuid, varchar, timestamp, jsonb, index, boolean } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';
import type { FunnelWidgetConfig, TrendWidgetConfig, RetentionWidgetConfig, LifecycleWidgetConfig, StickinessWidgetConfig, PathsWidgetConfig } from './widgets';

export type InsightType = 'trend' | 'funnel' | 'retention' | 'lifecycle' | 'stickiness' | 'paths';
export type InsightConfig = FunnelWidgetConfig | TrendWidgetConfig | RetentionWidgetConfig | LifecycleWidgetConfig | StickinessWidgetConfig | PathsWidgetConfig;

export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull().$type<InsightType>(),
  name: varchar('name', { length: 200 }).notNull(),
  description: varchar('description', { length: 1000 }),
  config: jsonb('config').notNull().$type<InsightConfig>(),
  is_favorite: boolean('is_favorite').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('insights_project_id_type_idx').on(table.project_id, table.type),
]);
