import { pgTable, uuid, varchar, timestamp, integer, bigint, boolean, jsonb } from 'drizzle-orm/pg-core';

export interface PlanFeatures {
  cohorts: boolean;
  lifecycle: boolean;
  stickiness: boolean;
  api_export: boolean;
  ai_insights: boolean;
}

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  events_limit: bigint('events_limit', { mode: 'number' }),
  data_retention_days: integer('data_retention_days'),
  max_projects: integer('max_projects'),
  ai_messages_per_month: integer('ai_messages_per_month'),
  features: jsonb('features').$type<PlanFeatures>().notNull(),
  is_public: boolean('is_public').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
