/**
 * Integration tests verifying that cohort breakdown with `not_performed_event`
 * uses the analysis window [date_from, date_to] rather than the rolling window
 * [date_to - N days, date_to].
 *
 * Issue #495: buildCohortFilterForBreakdown did not pass `dateFrom` to
 * buildCohortSubquery. As a result, not_performed_event cohorts in breakdown
 * mode used a rolling window anchored at date_to, which could incorrectly
 * exclude users who performed the event before date_from.
 *
 * Test strategy (mirrors issue #469 but for breakdown_cohort_ids instead of cohort_filters):
 *   - Funnel period: [date_from, date_to] = [30 days ago, 10 days ago]
 *   - Cohort: "did NOT perform 'checkout' in the last 60 days" (time_window_days=60)
 *   - personA: performed 'checkout' at 45 days ago (BEFORE date_from=30 days ago)
 *     → Rolling window [70 dAgo, 10 dAgo] catches 45 dAgo → incorrectly excluded (old bug)
 *     → Fixed window  [30 dAgo, 10 dAgo] does NOT catch 45 dAgo → correctly included (fix)
 *   - personB: never performed 'checkout'
 *     → Always included in cohort
 *   Both complete the funnel within [date_from, date_to].
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';
import type { CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

describe('queryFunnel — cohort breakdown not_performed_event uses [date_from, date_to] window (issue #495)', () => {
  it('includes users who performed the excluded event before date_from (ordered breakdown)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID(); // checkout at 45 dAgo (before date_from=30 dAgo)
    const personB = randomUUID(); // never checkout

    // personA: checkout event at 45 days ago (before date_from), funnel events within period
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(45),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a',
        event_name: 'complete',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    // personB: no checkout at all, funnel events within period
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b',
        event_name: 'complete',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    // Cohort: "did NOT perform checkout in last 60 days"
    // Rolling window relative to date_to=10dAgo: [70 dAgo, 10 dAgo]
    //   personA: checkout at 45 dAgo IS within [70, 10] → old code excludes personA (bug)
    // Fixed window [date_from=30 dAgo, date_to=10 dAgo]:
    //   personA: checkout at 45 dAgo is NOT within [30, 10] → new code includes personA (fix)
    const notPerformedCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Did not checkout',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [
          {
            type: 'not_performed_event',
            event_name: 'checkout',
            time_window_days: 60,
          },
        ],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'complete', label: 'Complete' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(30),
      date_to: daysAgo(10),
      breakdown_cohort_ids: [notPerformedCohort],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const cohortStep1 = rBd.steps.find(
      (s) => s.breakdown_value === notPerformedCohort.cohort_id && s.step === 1,
    );
    const cohortStep2 = rBd.steps.find(
      (s) => s.breakdown_value === notPerformedCohort.cohort_id && s.step === 2,
    );

    // Both personA and personB should be in the cohort:
    //   personA: checkout at 45 dAgo is BEFORE date_from=30 dAgo → not in [30, 10] → passes filter
    //   personB: no checkout → passes filter
    // Without the fix (rolling window from date_to):
    //   personA: checkout at 45 dAgo IS within [70, 10] → wrongly excluded → count=1
    expect(cohortStep1?.count).toBe(2);
    expect(cohortStep2?.count).toBe(2);
  });

  it('still excludes users who performed the excluded event within [date_from, date_to] (ordered breakdown)', async () => {
    const projectId = randomUUID();
    const personWithCheckout = randomUUID(); // checkout within analysis period
    const personWithoutCheckout = randomUUID(); // no checkout

    await insertTestEvents(ctx.ch, [
      // personWithCheckout: performed checkout inside [date_from, date_to]
      buildEvent({
        project_id: projectId,
        person_id: personWithCheckout,
        distinct_id: 'with-checkout',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(20),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithCheckout,
        distinct_id: 'with-checkout',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithCheckout,
        distinct_id: 'with-checkout',
        event_name: 'complete',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personWithoutCheckout,
        distinct_id: 'without-checkout',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personWithoutCheckout,
        distinct_id: 'without-checkout',
        event_name: 'complete',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    const notPerformedCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Did not checkout',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [
          {
            type: 'not_performed_event',
            event_name: 'checkout',
            time_window_days: 60,
          },
        ],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'complete', label: 'Complete' },
      ],
      conversion_window_days: 7,
      date_from: daysAgo(30),
      date_to: daysAgo(10),
      breakdown_cohort_ids: [notPerformedCohort],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const cohortStep1 = rBd.steps.find(
      (s) => s.breakdown_value === notPerformedCohort.cohort_id && s.step === 1,
    );

    // personWithCheckout: checkout at 20 dAgo IS within [30, 10] → excluded from cohort
    // personWithoutCheckout: no checkout → included
    expect(cohortStep1?.count).toBe(1);
  });

  it('includes users who performed the excluded event before date_from (unordered breakdown)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID(); // checkout at 45 dAgo (before date_from=30 dAgo)
    const personB = randomUUID(); // never checkout

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a-u',
        event_name: 'checkout',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(45),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a-u',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'person-a-u',
        event_name: 'complete',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(24),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b-u',
        event_name: 'signup',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(25),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'person-b-u',
        event_name: 'complete',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp: daysAgo(24),
      }),
    ]);

    const notPerformedCohort: CohortBreakdownEntry = {
      cohort_id: randomUUID(),
      name: 'Did not checkout',
      is_static: false,
      materialized: false,
      definition: {
        type: 'AND',
        values: [
          {
            type: 'not_performed_event',
            event_name: 'checkout',
            time_window_days: 60,
          },
        ],
      },
    };

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'complete', label: 'Complete' },
      ],
      conversion_window_days: 7,
      funnel_order_type: 'unordered',
      date_from: daysAgo(30),
      date_to: daysAgo(10),
      breakdown_cohort_ids: [notPerformedCohort],
    });

    expect(result.breakdown).toBe(true);
    const rBd = result as Extract<typeof result, { breakdown: true }>;

    const cohortStep1 = rBd.steps.find(
      (s) => s.breakdown_value === notPerformedCohort.cohort_id && s.step === 1,
    );

    // Both persons pass the filter (personA's checkout is before date_from)
    expect(cohortStep1?.count).toBe(2);
  });
});
