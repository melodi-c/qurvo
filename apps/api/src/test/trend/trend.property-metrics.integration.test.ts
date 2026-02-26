import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  msAgo,
  dateOffset,
  type ContainerContext,
} from '@qurvo/testing';
import type { CohortConditionGroup } from '@qurvo/db';
import { queryTrend } from '../../analytics/trend/trend.query';
import { sumSeriesValues } from '../helpers';
import { materializeCohort } from '../cohorts/helpers';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryTrend — with series filters', () => {
  it('applies filters on event properties', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 10),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'Premium Purchases',
        filters: [{ property: 'properties.plan', operator: 'eq', value: 'premium' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r5 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r5.series[0].data)).toBe(1);
  });
});

describe('queryTrend — property aggregation', () => {
  it('sums property values (property_sum)', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 100 }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 250 }),
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'purchase', label: 'Purchases' }],
      metric: 'property_sum',
      metric_property: 'properties.amount',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r6 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r6.series[0].data)).toBe(350);
  });

  it('averages property values (property_avg)', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'session',
        properties: JSON.stringify({ duration: 10 }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'session',
        properties: JSON.stringify({ duration: 30 }),
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'session', label: 'Sessions' }],
      metric: 'property_avg',
      metric_property: 'properties.duration',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r7 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(r7.series[0].data)).toBe(20);
  });

  it('finds min and max property values (property_min / property_max)', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'order',
        properties: JSON.stringify({ price: 5 }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'order',
        properties: JSON.stringify({ price: 99 }),
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u3',
        event_name: 'order',
        properties: JSON.stringify({ price: 42 }),
        timestamp: ts(3, 12),
      }),
    ]);

    const minResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'order', label: 'Orders' }],
      metric: 'property_min',
      metric_property: 'properties.price',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(minResult.compare).toBe(false);
    expect(minResult.breakdown).toBe(false);
    const rMin = minResult as Extract<typeof minResult, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(rMin.series[0].data)).toBe(5);

    const maxResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'order', label: 'Orders' }],
      metric: 'property_max',
      metric_property: 'properties.price',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(maxResult.compare).toBe(false);
    expect(maxResult.breakdown).toBe(false);
    const rMax = maxResult as Extract<typeof maxResult, { compare: false; breakdown: false }>;
    expect(sumSeriesValues(rMax.series[0].data)).toBe(99);
  });

  it('treats non-numeric property values as 0', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 'abc' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'purchase',
        properties: JSON.stringify({ amount: 100 }),
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'purchase', label: 'Purchases' }],
      metric: 'property_sum',
      metric_property: 'properties.amount',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r8 = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // "abc" → toFloat64OrZero → 0, 100 → 100, sum = 100
    expect(sumSeriesValues(r8.series[0].data)).toBe(100);
  });
});

describe('queryTrend — filter operator neq', () => {
  it('excludes events matching the specified property value', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u3',
        event_name: 'purchase',
        properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'purchase',
        label: 'Non-premium Purchases',
        filters: [{ property: 'properties.plan', operator: 'neq', value: 'premium' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // Only the 2 'free' plan purchases should be counted
    expect(sumSeriesValues(r.series[0].data)).toBe(2);
  });
});

describe('queryTrend — filter operators contains and not_contains', () => {
  it('includes only events whose property contains the given substring', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'page_view',
        browser: 'Chrome',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'page_view',
        browser: 'Chrome Mobile',
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u3',
        event_name: 'page_view',
        browser: 'Firefox',
        timestamp: ts(3, 12),
      }),
    ]);

    const containsResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'page_view',
        label: 'Chrome Views',
        filters: [{ property: 'browser', operator: 'contains', value: 'Chrome' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(containsResult.compare).toBe(false);
    expect(containsResult.breakdown).toBe(false);
    const rContains = containsResult as Extract<typeof containsResult, { compare: false; breakdown: false }>;
    // Both 'Chrome' and 'Chrome Mobile' match
    expect(sumSeriesValues(rContains.series[0].data)).toBe(2);

    const notContainsResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'page_view',
        label: 'Non-Chrome Views',
        filters: [{ property: 'browser', operator: 'not_contains', value: 'Chrome' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(notContainsResult.compare).toBe(false);
    expect(notContainsResult.breakdown).toBe(false);
    const rNotContains = notContainsResult as Extract<typeof notContainsResult, { compare: false; breakdown: false }>;
    // Only 'Firefox' does not match 'Chrome'
    expect(sumSeriesValues(rNotContains.series[0].data)).toBe(1);
  });
});

describe('queryTrend — filter operators is_set and is_not_set', () => {
  it('is_set includes events where property exists (including boolean false), is_not_set excludes them', async () => {
    const projectId = randomUUID();

    // u1: has 'opted_in' = false (a falsy JSON value — previously broke is_set before fix #95)
    // u2: has 'opted_in' = true
    // u3: does NOT have 'opted_in' key at all
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u1',
        event_name: 'track',
        properties: JSON.stringify({ opted_in: false }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u2',
        event_name: 'track',
        properties: JSON.stringify({ opted_in: true }),
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'u3',
        event_name: 'track',
        properties: JSON.stringify({ other: 'value' }),
        timestamp: ts(3, 12),
      }),
    ]);

    const isSetResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'track',
        label: 'Has opted_in',
        filters: [{ property: 'properties.opted_in', operator: 'is_set' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(isSetResult.compare).toBe(false);
    expect(isSetResult.breakdown).toBe(false);
    const rIsSet = isSetResult as Extract<typeof isSetResult, { compare: false; breakdown: false }>;
    // u1 (false) and u2 (true) both have the key — both should be counted
    expect(sumSeriesValues(rIsSet.series[0].data)).toBe(2);

    const isNotSetResult = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'track',
        label: 'Missing opted_in',
        filters: [{ property: 'properties.opted_in', operator: 'is_not_set' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(isNotSetResult.compare).toBe(false);
    expect(isNotSetResult.breakdown).toBe(false);
    const rIsNotSet = isNotSetResult as Extract<typeof isNotSetResult, { compare: false; breakdown: false }>;
    // Only u3 lacks the 'opted_in' key
    expect(sumSeriesValues(rIsNotSet.series[0].data)).toBe(1);
  });
});

describe('queryTrend — cohort filters', () => {
  it('inline cohort filter restricts results to cohort members only', async () => {
    const projectId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(5000),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      cohort_filters: [{
        cohort_id: randomUUID(),
        definition: {
          type: 'AND',
          values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
        },
        materialized: false,
        is_static: false,
      }],
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // Only the premium user's event should be counted
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });

  it('materialized cohort filter restricts results to cohort members only', async () => {
    const projectId = randomUUID();
    const cohortId = randomUUID();
    const premiumUser = randomUUID();
    const freeUser = randomUUID();
    const today = dateOffset(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: premiumUser,
        distinct_id: 'premium',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: freeUser,
        distinct_id: 'free',
        event_name: 'page_view',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: msAgo(5000),
      }),
    ]);

    const definition: CohortConditionGroup = {
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    };

    await materializeCohort(ctx.ch, projectId, cohortId, definition);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      cohort_filters: [{ cohort_id: cohortId, definition, materialized: true, is_static: false }],
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // Only the premium user's event should be counted
    expect(sumSeriesValues(r.series[0].data)).toBe(1);
  });
});

describe('queryTrend — person property filters', () => {
  it('filters events by user_properties in series filters', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'premium1',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'premium2',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'free1',
        event_name: 'login',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{
        event_name: 'login',
        label: 'Premium Logins',
        filters: [{ property: 'user_properties.plan', operator: 'eq', value: 'premium' }],
      }],
      metric: 'total_events',
      granularity: 'day',
      date_from: daysAgo(3),
      date_to: daysAgo(3),
    });

    expect(result.compare).toBe(false);
    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { compare: false; breakdown: false }>;
    // Only the 2 premium user logins should be counted
    expect(sumSeriesValues(r.series[0].data)).toBe(2);
  });
});
