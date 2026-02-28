import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { CohortConditionGroup } from '@qurvo/db';
import { CohortsService } from '../../cohorts/cohorts.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

// ── Zod schemas for CohortConditionGroup ────────────────────────────────────
//
// DeepSeek Reasoner rejects tool schemas that contain:
//   1. anyOf branches without a top-level "type" field
//   2. $ref / recursive ($lazy) schemas that expand into nested anyOf
//
// To avoid both issues, we use a flat two-level structure:
//   - Top level: a single group { type: 'AND'|'OR', values: [...items] }
//   - Items: discriminatedUnion of all leaf conditions + inner AND/OR groups
//   - Inner groups contain only leaf conditions (no further recursion)
//
// This matches the real CohortConditionGroup type from @qurvo/db for all
// practical AI-generated cohorts (LLMs rarely produce >2 levels of nesting).

const cohortPropertyOperatorSchema = z.enum([
  'eq', 'neq', 'contains', 'not_contains',
  'contains_multi', 'not_contains_multi',
  'is_set', 'is_not_set',
  'gt', 'lt', 'gte', 'lte',
  'regex', 'not_regex',
  'in', 'not_in',
  'between', 'not_between',
  'is_date_before', 'is_date_after', 'is_date_exact',
]);

const cohortEventFilterSchema = z.object({
  property: z.string().describe('Event property name (e.g. "properties.plan", "country")'),
  operator: cohortPropertyOperatorSchema.describe('Filter operator'),
  value: z.string().nullish().describe('Single value for comparison'),
  values: z.array(z.string()).nullish().describe('Multiple values for "in"/"not_in"/"contains_multi"/"not_contains_multi" operators'),
});

// ── Leaf condition schemas (no nesting) ─────────────────────────────────────

const eventConditionSchema = z.object({
  type: z.literal('event'),
  event_name: z.string().describe('Name of the event'),
  count_operator: z.enum(['gte', 'lte', 'eq']).describe('How to compare event count: gte (at least), lte (at most), eq (exactly)'),
  count: z.number().int().min(0).describe('Event count threshold'),
  time_window_days: z.number().int().min(1).describe('Look-back window in days'),
  event_filters: z.array(cohortEventFilterSchema).nullish().describe('Optional filters on event properties'),
  aggregation_type: z.enum(['count', 'sum', 'avg', 'min', 'max', 'median', 'p75', 'p90', 'p95', 'p99']).nullish().describe('Aggregation for numeric property (default: count of events)'),
  aggregation_property: z.string().nullish().describe('Property to aggregate when aggregation_type is not count'),
});

const personPropertyConditionSchema = z.object({
  type: z.literal('person_property'),
  property: z.string().describe('Person property name (e.g. "plan", "country")'),
  operator: cohortPropertyOperatorSchema.describe('Filter operator'),
  value: z.string().nullish().describe('Single value to compare against'),
  values: z.array(z.string()).nullish().describe('Multiple values for "in"/"not_in" operators'),
});

const cohortConditionSchema = z.object({
  type: z.literal('cohort'),
  cohort_id: z.string().uuid().describe('UUID of another cohort to reference'),
  negated: z.boolean().describe('Whether to include (false) or exclude (true) members of the referenced cohort'),
});

const firstTimeEventConditionSchema = z.object({
  type: z.literal('first_time_event'),
  event_name: z.string().describe('Name of the event'),
  time_window_days: z.number().int().min(1).describe('Window in which the first occurrence must fall'),
  event_filters: z.array(cohortEventFilterSchema).nullish().describe('Optional filters on event properties'),
});

const notPerformedEventConditionSchema = z.object({
  type: z.literal('not_performed_event'),
  event_name: z.string().describe('Name of the event the person must NOT have performed'),
  time_window_days: z.number().int().min(1).describe('Look-back window in days'),
  event_filters: z.array(cohortEventFilterSchema).nullish().describe('Optional filters on event properties'),
});

const eventSequenceConditionSchema = z.object({
  type: z.literal('event_sequence'),
  steps: z.array(z.object({
    event_name: z.string(),
    event_filters: z.array(cohortEventFilterSchema).nullish(),
  })).min(2).describe('Ordered list of events the person must have performed in sequence'),
  time_window_days: z.number().int().min(1).describe('Window in which the full sequence must occur'),
});

const notPerformedEventSequenceConditionSchema = z.object({
  type: z.literal('not_performed_event_sequence'),
  steps: z.array(z.object({
    event_name: z.string(),
    event_filters: z.array(cohortEventFilterSchema).nullish(),
  })).min(2).describe('Ordered list of events the person must NOT have completed in sequence'),
  time_window_days: z.number().int().min(1).describe('Window in which the sequence check applies'),
});

const performedRegularlyConditionSchema = z.object({
  type: z.literal('performed_regularly'),
  event_name: z.string().describe('Name of the event'),
  period_type: z.enum(['day', 'week', 'month']).describe('Granularity of "regularly": per day, week, or month'),
  total_periods: z.number().int().min(1).describe('Total number of periods to evaluate'),
  min_periods: z.number().int().min(1).describe('Minimum number of those periods in which the event must occur'),
  time_window_days: z.number().int().min(1).describe('Overall look-back window in days'),
  event_filters: z.array(cohortEventFilterSchema).nullish().describe('Optional filters on event properties'),
});

const stoppedPerformingConditionSchema = z.object({
  type: z.literal('stopped_performing'),
  event_name: z.string().describe('Name of the event'),
  recent_window_days: z.number().int().min(1).describe('Recent period in which event must NOT appear'),
  historical_window_days: z.number().int().min(1).describe('Historical period in which event must have appeared'),
  event_filters: z.array(cohortEventFilterSchema).nullish().describe('Optional filters on event properties'),
});

const restartedPerformingConditionSchema = z.object({
  type: z.literal('restarted_performing'),
  event_name: z.string().describe('Name of the event'),
  recent_window_days: z.number().int().min(1).describe('Recent period in which event must reappear'),
  gap_window_days: z.number().int().min(1).describe('Gap period in between where event was absent'),
  historical_window_days: z.number().int().min(1).describe('Historical period before the gap'),
  event_filters: z.array(cohortEventFilterSchema).nullish().describe('Optional filters on event properties'),
});

// All leaf condition options (no group wrappers) — used to build the flat union
const leafConditionOptions = [
  eventConditionSchema,
  personPropertyConditionSchema,
  cohortConditionSchema,
  firstTimeEventConditionSchema,
  notPerformedEventConditionSchema,
  eventSequenceConditionSchema,
  notPerformedEventSequenceConditionSchema,
  performedRegularlyConditionSchema,
  stoppedPerformingConditionSchema,
  restartedPerformingConditionSchema,
] as const;

// Flat discriminated union of leaf conditions only (no nested anyOf)
const leafConditionUnionSchema = z.discriminatedUnion('type', leafConditionOptions);

// ── Inner groups (can contain leaf conditions only) ──────────────────────────
// Using type literals 'AND' and 'OR' as separate objects so that the
// discriminatedUnion for items is flat — each branch has a top-level "type".

const innerAndGroupSchema = z.object({
  type: z.literal('AND'),
  values: z.array(leafConditionUnionSchema).min(1).describe('Conditions combined with AND'),
});

const innerOrGroupSchema = z.object({
  type: z.literal('OR'),
  values: z.array(leafConditionUnionSchema).min(1).describe('Conditions combined with OR'),
});

// ── Items schema: leaf condition OR inner group ──────────────────────────────
// Using discriminatedUnion ensures every anyOf branch has a "type" field,
// which is required for DeepSeek Reasoner compatibility.

const cohortItemSchema = z.discriminatedUnion('type', [
  ...leafConditionOptions,
  innerAndGroupSchema,
  innerOrGroupSchema,
]);

// ── Top-level definition (always a group) ────────────────────────────────────

const definitionSchema = z.object({
  type: z.enum(['AND', 'OR']).describe('Logical operator combining the top-level items'),
  values: z.array(cohortItemSchema)
    .min(1)
    .describe(
      'List of conditions or nested groups. ' +
      'Each item must have a "type" field. ' +
      'Leaf condition types: event, person_property, cohort, first_time_event, ' +
      'not_performed_event, event_sequence, not_performed_event_sequence, ' +
      'performed_regularly, stopped_performing, restarted_performing. ' +
      'Nested group types: AND, OR (each with their own "values" array of leaf conditions).',
    ),
});

const argsSchema = z.object({
  name: z.string().min(1).max(200).describe('Cohort name, e.g. "Power users", "Churned last 30 days"'),
  description: z.string().max(1000).nullish().describe('Optional human-readable description of who this cohort captures'),
  definition: definitionSchema.describe(
    'Cohort definition. Top-level is always { type: "AND"|"OR", values: [...] }. ' +
    'Items in values can be leaf conditions or nested AND/OR groups (one level deep).',
  ),
});

const tool = defineTool({
  name: 'create_cohort',
  description:
    'Create a new behavioral cohort from a condition definition and save it to the project. ' +
    'Returns the cohort ID and a direct link to view it. ' +
    'Use this when the user asks to "create a cohort", "save a segment", or "build an audience" of users matching certain criteria. ' +
    'The definition follows the same structure as the Cohort Editor in the UI.',
  schema: argsSchema,
});

@Injectable()
export class CreateCohortTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly cohortsService: CohortsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const cohort = await this.cohortsService.create(userId, projectId, {
      name: args.name,
      description: args.description,
      definition: args.definition as CohortConditionGroup,
    });

    return {
      cohort_id: cohort.id,
      name: cohort.name,
      link: `/cohorts/${cohort.id}`,
    };
  });
}
