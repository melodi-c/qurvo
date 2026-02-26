import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { CohortConditionGroup } from '@qurvo/db';
import { CohortsService } from '../../cohorts/cohorts.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

// ── Recursive Zod schema for CohortConditionGroup ───────────────────────────

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
  value: z.string().optional().describe('Single value for comparison'),
  values: z.array(z.string()).optional().describe('Multiple values for "in"/"not_in"/"contains_multi"/"not_contains_multi" operators'),
});

const cohortConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('event'),
    event_name: z.string().describe('Name of the event'),
    count_operator: z.enum(['gte', 'lte', 'eq']).describe('How to compare event count: gte (at least), lte (at most), eq (exactly)'),
    count: z.number().int().min(0).describe('Event count threshold'),
    time_window_days: z.number().int().min(1).describe('Look-back window in days'),
    event_filters: z.array(cohortEventFilterSchema).optional().describe('Optional filters on event properties'),
    aggregation_type: z.enum(['count', 'sum', 'avg', 'min', 'max', 'median', 'p75', 'p90', 'p95', 'p99']).optional().describe('Aggregation for numeric property (default: count of events)'),
    aggregation_property: z.string().optional().describe('Property to aggregate when aggregation_type is not count'),
  }),
  z.object({
    type: z.literal('person_property'),
    property: z.string().describe('Person property name (e.g. "plan", "country")'),
    operator: cohortPropertyOperatorSchema.describe('Filter operator'),
    value: z.string().optional().describe('Single value to compare against'),
    values: z.array(z.string()).optional().describe('Multiple values for "in"/"not_in" operators'),
  }),
  z.object({
    type: z.literal('cohort'),
    cohort_id: z.string().uuid().describe('UUID of another cohort to reference'),
    negated: z.boolean().describe('Whether to include (false) or exclude (true) members of the referenced cohort'),
  }),
  z.object({
    type: z.literal('first_time_event'),
    event_name: z.string().describe('Name of the event'),
    time_window_days: z.number().int().min(1).describe('Window in which the first occurrence must fall'),
    event_filters: z.array(cohortEventFilterSchema).optional().describe('Optional filters on event properties'),
  }),
  z.object({
    type: z.literal('not_performed_event'),
    event_name: z.string().describe('Name of the event the person must NOT have performed'),
    time_window_days: z.number().int().min(1).describe('Look-back window in days'),
    event_filters: z.array(cohortEventFilterSchema).optional().describe('Optional filters on event properties'),
  }),
  z.object({
    type: z.literal('event_sequence'),
    steps: z.array(z.object({
      event_name: z.string(),
      event_filters: z.array(cohortEventFilterSchema).optional(),
    })).min(2).describe('Ordered list of events the person must have performed in sequence'),
    time_window_days: z.number().int().min(1).describe('Window in which the full sequence must occur'),
  }),
  z.object({
    type: z.literal('not_performed_event_sequence'),
    steps: z.array(z.object({
      event_name: z.string(),
      event_filters: z.array(cohortEventFilterSchema).optional(),
    })).min(2).describe('Ordered list of events the person must NOT have completed in sequence'),
    time_window_days: z.number().int().min(1).describe('Window in which the sequence check applies'),
  }),
  z.object({
    type: z.literal('performed_regularly'),
    event_name: z.string().describe('Name of the event'),
    period_type: z.enum(['day', 'week', 'month']).describe('Granularity of "regularly": per day, week, or month'),
    total_periods: z.number().int().min(1).describe('Total number of periods to evaluate'),
    min_periods: z.number().int().min(1).describe('Minimum number of those periods in which the event must occur'),
    time_window_days: z.number().int().min(1).describe('Overall look-back window in days'),
    event_filters: z.array(cohortEventFilterSchema).optional().describe('Optional filters on event properties'),
  }),
  z.object({
    type: z.literal('stopped_performing'),
    event_name: z.string().describe('Name of the event'),
    recent_window_days: z.number().int().min(1).describe('Recent period in which event must NOT appear'),
    historical_window_days: z.number().int().min(1).describe('Historical period in which event must have appeared'),
    event_filters: z.array(cohortEventFilterSchema).optional().describe('Optional filters on event properties'),
  }),
  z.object({
    type: z.literal('restarted_performing'),
    event_name: z.string().describe('Name of the event'),
    recent_window_days: z.number().int().min(1).describe('Recent period in which event must reappear'),
    gap_window_days: z.number().int().min(1).describe('Gap period in between where event was absent'),
    historical_window_days: z.number().int().min(1).describe('Historical period before the gap'),
    event_filters: z.array(cohortEventFilterSchema).optional().describe('Optional filters on event properties'),
  }),
]);

type CohortConditionOrGroup = z.infer<typeof cohortConditionSchema> | CohortConditionGroupInput;

interface CohortConditionGroupInput {
  type: 'AND' | 'OR';
  values: CohortConditionOrGroup[];
}

const cohortConditionGroupSchema: z.ZodType<CohortConditionGroupInput> = z.lazy(() =>
  z.object({
    type: z.enum(['AND', 'OR']).describe('Logical operator combining the conditions'),
    values: z.array(z.union([cohortConditionSchema, cohortConditionGroupSchema]))
      .min(1)
      .describe('List of conditions or nested groups'),
  }),
);

const argsSchema = z.object({
  name: z.string().min(1).max(200).describe('Cohort name, e.g. "Power users", "Churned last 30 days"'),
  description: z.string().max(1000).optional().describe('Optional human-readable description of who this cohort captures'),
  definition: cohortConditionGroupSchema.describe(
    'Cohort definition as a nested condition group. ' +
    'Top-level must be { type: "AND"|"OR", values: [...conditions] }. ' +
    'Supported condition types: event, person_property, cohort, first_time_event, ' +
    'not_performed_event, event_sequence, not_performed_event_sequence, ' +
    'performed_regularly, stopped_performing, restarted_performing.',
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
