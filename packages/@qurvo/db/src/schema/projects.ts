import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { plans } from './plans';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan_id: uuid('plan_id').references(() => plans.id),
  is_demo: boolean('is_demo').notNull().default(false),
  demo_scenario: varchar('demo_scenario', { length: 50 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
