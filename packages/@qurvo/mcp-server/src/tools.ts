import { z } from 'zod';
import { queryApi } from './client';

// Use any to avoid loading complex recursive MCP SDK types that cause tsc OOM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpServerAny = any;

const propertyFilterSchema = z.object({
  property: z.string().describe(
    'Property to filter on. Use "properties.<key>" for event properties (e.g. "properties.promocode"), ' +
    'or direct columns: url, referrer, page_title, page_path, device_type, browser, os, country, region, city',
  ),
  operator: z.enum(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set']).describe('Filter operator'),
  value: z.string().optional().describe('Value to compare against (not needed for is_set/is_not_set)'),
});

function toTextContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerTools(server: McpServerAny): void {
  // list_event_names — discover available events
  server.tool(
    'list_event_names',
    'List all tracked event names in the project. Use this to discover available events before querying.',
    {
      project_id: z.string().uuid().describe('Project UUID'),
    },
    async ({ project_id }: { project_id: string }) => {
      const data = await queryApi('/api/analytics/event-names', { project_id });
      return toTextContent(data);
    },
  );

  // query_trend — time-series trend data
  server.tool(
    'query_trend',
    'Query time-series trend data for events. Returns data points over time with configurable granularity. ' +
    'Supports multiple series, breakdown by property, period comparison, and per-series filters.',
    {
      project_id: z.string().uuid().describe('Project UUID'),
      series: z.array(z.object({
        event_name: z.string().describe('Name of the event to track'),
        label: z.string().describe('Display label for this series'),
        filters: z.array(propertyFilterSchema).optional().describe('Optional filters to narrow down events by property values'),
      })).min(1).max(5).describe('Event series to query'),
      metric: z.enum(['total_events', 'unique_users', 'events_per_user']).describe('Aggregation metric'),
      granularity: z.enum(['hour', 'day', 'week', 'month']).describe('Time bucket granularity. Use day for <60 days, week for 60-180, month for >180'),
      date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
      breakdown_property: z.string().optional().describe('Optional event property to break down by'),
      compare: z.boolean().optional().describe('Whether to compare with the previous period'),
    },
    async (args: {
      project_id: string;
      series: Array<{ event_name: string; label: string; filters?: Array<{ property: string; operator: string; value?: string }> }>;
      metric: string;
      granularity: string;
      date_from: string;
      date_to: string;
      breakdown_property?: string;
      compare?: boolean;
    }) => {
      const { project_id, series, metric, granularity, date_from, date_to, breakdown_property, compare } = args;
      const data = await queryApi('/api/analytics/trend', {
        project_id,
        series,
        metric,
        granularity,
        date_from,
        date_to,
        breakdown_property,
        compare,
      });
      return toTextContent(data);
    },
  );

  // query_funnel — conversion funnel
  server.tool(
    'query_funnel',
    'Query conversion funnel with multiple ordered steps. Returns conversion rates, drop-offs, and average time between steps. Supports per-step filters.',
    {
      project_id: z.string().uuid().describe('Project UUID'),
      steps: z.array(z.object({
        event_name: z.string().describe('Event name for this funnel step'),
        label: z.string().describe('Display label for this step'),
        filters: z.array(propertyFilterSchema).optional().describe('Optional filters to narrow down events by property values'),
      })).min(2).max(10).describe('Ordered funnel steps'),
      conversion_window_days: z.number().int().min(1).max(90).optional().describe('Max days allowed for conversion (1-90). Default: 14'),
      date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
      breakdown_property: z.string().optional().describe('Optional property to break down funnel by'),
    },
    async (args: {
      project_id: string;
      steps: Array<{ event_name: string; label: string; filters?: Array<{ property: string; operator: string; value?: string }> }>;
      conversion_window_days?: number;
      date_from: string;
      date_to: string;
      breakdown_property?: string;
    }) => {
      const { project_id, steps, conversion_window_days, date_from, date_to, breakdown_property } = args;
      const data = await queryApi('/api/analytics/funnel', {
        project_id,
        steps,
        conversion_window_days: conversion_window_days ?? 14,
        date_from,
        date_to,
        breakdown_property,
      });
      return toTextContent(data);
    },
  );

  // query_retention — user retention over time
  server.tool(
    'query_retention',
    'Query user retention — how many users return to perform an event over time periods after their first occurrence.',
    {
      project_id: z.string().uuid().describe('Project UUID'),
      target_event: z.string().describe('Event to track retention for'),
      retention_type: z.enum(['first_time', 'recurring']).describe('first_time = cohort by first event; recurring = any repeat'),
      granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
      periods: z.number().int().min(1).max(30).optional().describe('Number of periods to show (1-30). Default: 11'),
      date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
    },
    async (args: {
      project_id: string;
      target_event: string;
      retention_type: string;
      granularity: string;
      periods?: number;
      date_from: string;
      date_to: string;
    }) => {
      const { project_id, target_event, retention_type, granularity, periods, date_from, date_to } = args;
      const data = await queryApi('/api/analytics/retention', {
        project_id,
        target_event,
        retention_type,
        granularity,
        periods: periods ?? 11,
        date_from,
        date_to,
      });
      return toTextContent(data);
    },
  );

  // query_lifecycle — user lifecycle stages
  server.tool(
    'query_lifecycle',
    'Query user lifecycle stages — categorizes users into new, returning, resurrecting, and dormant over time.',
    {
      project_id: z.string().uuid().describe('Project UUID'),
      target_event: z.string().describe('Event to analyze lifecycle for'),
      granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
      date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
    },
    async (args: {
      project_id: string;
      target_event: string;
      granularity: string;
      date_from: string;
      date_to: string;
    }) => {
      const { project_id, target_event, granularity, date_from, date_to } = args;
      const data = await queryApi('/api/analytics/lifecycle', {
        project_id,
        target_event,
        granularity,
        date_from,
        date_to,
      });
      return toTextContent(data);
    },
  );

  // query_stickiness — user stickiness / frequency of use
  server.tool(
    'query_stickiness',
    'Query stickiness — how many users perform an event X number of times within each period.',
    {
      project_id: z.string().uuid().describe('Project UUID'),
      target_event: z.string().describe('Event to analyze stickiness for'),
      granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
      date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
    },
    async (args: {
      project_id: string;
      target_event: string;
      granularity: string;
      date_from: string;
      date_to: string;
    }) => {
      const { project_id, target_event, granularity, date_from, date_to } = args;
      const data = await queryApi('/api/analytics/stickiness', {
        project_id,
        target_event,
        granularity,
        date_from,
        date_to,
      });
      return toTextContent(data);
    },
  );
}
