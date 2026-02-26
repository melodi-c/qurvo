import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── P1: Exclusion steps ─────────────────────────────────────────────────────

describe('queryFunnel — per-window exclusion', () => {
  it('does not exclude a user who re-enters the funnel after an exclusion event', async () => {
    // Pattern: step1(T1) → exclusion(T2) → step1(T3) → step2(T4)
    // First window [T1, T4] is tainted by exclusion at T2.
    // But second window [T3, T4] is clean (exclusion at T2 is before T3).
    // User should NOT be excluded because a clean conversion path exists.
    const projectId = randomUUID();
    const personReentry = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Re-entry user: signup → cancel → signup (again) → purchase
      // Second signup starts a fresh window with no exclusion in it → should convert
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'signup',
        timestamp: msAgo(8000), // T1: first signup
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'cancel',
        timestamp: msAgo(6000), // T2: exclusion between T1 and final purchase
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'signup',
        timestamp: msAgo(4000), // T3: second signup — fresh window start after exclusion
      }),
      buildEvent({
        project_id: projectId,
        person_id: personReentry,
        distinct_id: 're-entry',
        event_name: 'purchase',
        timestamp: msAgo(2000), // T4: purchase — clean window [T3, T4] with no exclusion
      }),
      // Truly excluded: signup → cancel → purchase (no re-entry)
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'truly-excluded',
        event_name: 'signup',
        timestamp: msAgo(8000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'truly-excluded',
        event_name: 'cancel',
        timestamp: msAgo(6000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'truly-excluded',
        event_name: 'purchase',
        timestamp: msAgo(2000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personExcluded: signup → cancel → purchase, all paths tainted → excluded from all steps
    // personReentry: signup → cancel → signup → purchase, second window (T3→T4) is clean → converts
    // The exclusion filter removes excluded users from all funnel step counts (including step 1)
    expect(r.steps[0].count).toBe(1); // only re-entry user (personExcluded is fully excluded)
    expect(r.steps[1].count).toBe(1); // re-entry user converts via second window
  });

  it('does not exclude a user whose exclusion event occurred outside the conversion window', async () => {
    // Pattern: exclusion at T0 (long before), step1 at T1, step2 at T2 (T2-T1 < window)
    // The exclusion at T0 is outside the [T1, T1+window] range → should NOT exclude
    const projectId = randomUUID();
    const personOldExcl = randomUUID();

    // Conversion window: 10 seconds
    const windowMs = 10_000;
    // step1 at 5s ago, step2 at 2s ago — within 10s window
    // exclusion at 30s ago — outside the 10s window starting from step1 at 5s ago
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personOldExcl,
        distinct_id: 'old-excl',
        event_name: 'cancel',
        timestamp: msAgo(30_000), // exclusion 30s ago — outside 10s window from step1
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOldExcl,
        distinct_id: 'old-excl',
        event_name: 'signup',
        timestamp: msAgo(5_000), // step1 at 5s ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personOldExcl,
        distinct_id: 'old-excl',
        event_name: 'purchase',
        timestamp: msAgo(2_000), // step2 at 2s ago — 3s after step1, within 10s window
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 0,
      conversion_window_value: windowMs / 1000,
      conversion_window_unit: 'second',
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // User should convert — exclusion happened 30s before step1, not within the 10s window
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});

describe('queryFunnel — exclusion steps', () => {
  it('excludes users who performed an exclusion event between funnel steps', async () => {
    const projectId = randomUUID();
    const personClean = randomUUID();
    const personExcluded = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Clean: signup → purchase (no cancel between)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
      // Excluded: signup → cancel → purchase
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'signup',
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'cancel',
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded',
        event_name: 'purchase',
        timestamp: msAgo(1000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'signup', label: 'Signup' },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const rExcl = result as Extract<typeof result, { breakdown: false }>;
    expect(rExcl.steps[0].count).toBe(1); // only clean user
    expect(rExcl.steps[1].count).toBe(1);
  });
});

// ── P1: Granular conversion window ──────────────────────────────────────────

describe('queryFunnel — conversion window units', () => {
  it('uses minute-based conversion window', async () => {
    const projectId = randomUUID();
    const personFast = randomUUID();
    const personSlow = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Fast: step_a → step_b within 30 seconds
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_a',
        timestamp: msAgo(60_000), // 60 sec ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personFast,
        distinct_id: 'fast',
        event_name: 'step_b',
        timestamp: msAgo(30_000), // 30 sec ago
      }),
      // Slow: step_a → step_b with 3 minutes gap
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_a',
        timestamp: msAgo(300_000), // 5 min ago
      }),
      buildEvent({
        project_id: projectId,
        person_id: personSlow,
        distinct_id: 'slow',
        event_name: 'step_b',
        timestamp: msAgo(120_000), // 2 min ago
      }),
    ]);

    // 1-minute window: only fast user converts
    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        { event_name: 'step_a', label: 'A' },
        { event_name: 'step_b', label: 'B' },
      ],
      conversion_window_days: 1, // fallback
      conversion_window_value: 1,
      conversion_window_unit: 'minute',
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.breakdown).toBe(false);
    const rWin = result as Extract<typeof result, { breakdown: false }>;
    expect(rWin.steps[0].count).toBe(2); // both entered
    expect(rWin.steps[1].count).toBe(1); // only fast within 1 min
  });
});
