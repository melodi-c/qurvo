import { pgTable, uuid, varchar, timestamp, jsonb, index, bigint, boolean } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

// ── Cohort definition types ──────────────────────────────────────────────────

export type CohortPropertyOperator =
  | 'eq' | 'neq' | 'contains' | 'not_contains'
  | 'is_set' | 'is_not_set'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'regex' | 'not_regex'
  | 'in' | 'not_in'
  | 'between' | 'not_between';

export type CohortCountOperator = 'gte' | 'lte' | 'eq';

// ── Event filter (sub-filter on event conditions) ────────────────────────────

export interface CohortEventFilter {
  property: string;
  operator: CohortPropertyOperator;
  value?: string;
  values?: string[];
}

// ── Condition types ──────────────────────────────────────────────────────────

export interface CohortPropertyCondition {
  type: 'person_property';
  property: string;
  operator: CohortPropertyOperator;
  value?: string;
  values?: string[];
}

export interface CohortEventCondition {
  type: 'event';
  event_name: string;
  count_operator: CohortCountOperator;
  count: number;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface CohortCohortCondition {
  type: 'cohort';
  cohort_id: string;
  negated: boolean;
}

export interface CohortFirstTimeEventCondition {
  type: 'first_time_event';
  event_name: string;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface CohortNotPerformedEventCondition {
  type: 'not_performed_event';
  event_name: string;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface CohortEventSequenceCondition {
  type: 'event_sequence';
  steps: { event_name: string; event_filters?: CohortEventFilter[] }[];
  time_window_days: number;
}

export interface CohortNotPerformedEventSequenceCondition {
  type: 'not_performed_event_sequence';
  steps: { event_name: string; event_filters?: CohortEventFilter[] }[];
  time_window_days: number;
}

export interface CohortPerformedRegularlyCondition {
  type: 'performed_regularly';
  event_name: string;
  period_type: 'day' | 'week' | 'month';
  total_periods: number;
  min_periods: number;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface CohortStoppedPerformingCondition {
  type: 'stopped_performing';
  event_name: string;
  recent_window_days: number;
  historical_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface CohortRestartedPerformingCondition {
  type: 'restarted_performing';
  event_name: string;
  recent_window_days: number;
  gap_window_days: number;
  historical_window_days: number;
  event_filters?: CohortEventFilter[];
}

export type CohortCondition =
  | CohortPropertyCondition
  | CohortEventCondition
  | CohortCohortCondition
  | CohortFirstTimeEventCondition
  | CohortNotPerformedEventCondition
  | CohortEventSequenceCondition
  | CohortNotPerformedEventSequenceCondition
  | CohortPerformedRegularlyCondition
  | CohortStoppedPerformingCondition
  | CohortRestartedPerformingCondition;

// ── V1 flat definition (legacy) ──────────────────────────────────────────────

export interface CohortDefinition {
  match: 'all' | 'any';
  conditions: CohortCondition[];
}

// ── V2 nested group definition ───────────────────────────────────────────────

export interface CohortConditionGroup {
  type: 'AND' | 'OR';
  values: (CohortCondition | CohortConditionGroup)[];
}

export type CohortDefinitionV2 = CohortConditionGroup;

// ── Type guards & helpers ────────────────────────────────────────────────────

export function isV2Definition(def: CohortDefinition | CohortDefinitionV2): def is CohortDefinitionV2 {
  return 'type' in def && (def.type === 'AND' || def.type === 'OR') && 'values' in def;
}

export function isConditionGroup(val: CohortCondition | CohortConditionGroup): val is CohortConditionGroup {
  return 'type' in val && (val.type === 'AND' || val.type === 'OR') && 'values' in val;
}

export function normalizeDefinition(def: CohortDefinition | CohortDefinitionV2): CohortDefinitionV2 {
  if (isV2Definition(def)) return def;
  return {
    type: def.match === 'all' ? 'AND' : 'OR',
    values: def.conditions,
  };
}

// ── Table ────────────────────────────────────────────────────────────────────

export const cohorts = pgTable('cohorts', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: varchar('description', { length: 1000 }),
  definition: jsonb('definition').notNull().$type<CohortDefinition | CohortDefinitionV2>(),
  is_static: boolean('is_static').notNull().default(false),
  membership_version: bigint('membership_version', { mode: 'number' }),
  membership_computed_at: timestamp('membership_computed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('cohorts_project_id_idx').on(table.project_id),
]);
