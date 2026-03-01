import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/**
 * Tests for issue #497: exclusions in unordered funnel must only check (f, t) pairs
 * within the anchor window [anchor_ms, anchor_ms + window], not across all sessions.
 *
 * Without the fix, a historical clean session (old step-A → step-B with no exclusion)
 * creates a false clean=true result that masks a tainted anchor-window session
 * (new step-A → exclusion-event → step-B). The user would not be excluded — incorrectly.
 */
describe('queryFunnel — unordered exclusion: anchor-window isolation (issue #497)', () => {
  it('excludes a user who has a tainted anchor-window session despite an old clean session', async () => {
    // Timeline (funnel: step_a → step_b, window = 7 days, exclusion: cancel between step_a and step_b):
    //
    //   Day 1: step_a(T=0), step_b(T=1h) — old clean session (no cancel) — outside anchor window
    //   Day 20: step_a(T=20d), cancel(T=20d+1h), step_b(T=20d+2h) — anchor window, TAINTED
    //
    // Without fix: exclusion CTE finds pair (f=0, t=1h) → clean=true → user NOT excluded.
    // With fix: only pairs with f >= anchor_ms (T=20d) are checked → only the tainted pair
    //           exists in the anchor window → user is correctly excluded.
    const projectId = randomUUID();
    const personTainted = randomUUID(); // tainted anchor-window, old clean session — should be excluded
    const personClean = randomUUID();   // clean anchor-window — should convert

    const now = Date.now();
    // Old clean session: 20 days ago
    const oldSessionA = now - 20 * DAY_MS;
    const oldSessionB = oldSessionA + 60 * 60 * 1000; // 1h later

    // Tainted anchor-window: 2 days ago
    const anchorA = now - 2 * DAY_MS;
    const anchorCancel = anchorA + 60 * 60 * 1000;          // 1h later
    const anchorB = anchorA + 2 * 60 * 60 * 1000;           // 2h later

    await insertTestEvents(ctx.ch, [
      // personTainted: old clean session (day 1)
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'step_a',
        timestamp: new Date(oldSessionA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'step_b',
        timestamp: new Date(oldSessionB).toISOString(),
      }),

      // personTainted: tainted anchor-window (day 20)
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'step_a',
        timestamp: new Date(anchorA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'cancel',
        timestamp: new Date(anchorCancel).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'step_b',
        timestamp: new Date(anchorB).toISOString(),
      }),

      // personClean: clean anchor-window only (no cancel)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'step_a',
        timestamp: new Date(now - 1 * DAY_MS).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'step_b',
        timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(), // 12h later
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-25),
      date_to: dateOffset(1),
      timezone: 'UTC',
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // personTainted must be excluded (tainted anchor window, even though they have an old clean session)
    // personClean converts
    // So only 1 user remains in the funnel
    expect(r.steps[0].count).toBe(1); // only personClean
    expect(r.steps[1].count).toBe(1); // personClean converts
  });

  it('does NOT exclude a user whose anchor window is clean, even if an old session is tainted', async () => {
    // Timeline (funnel: step_a → step_b, window = 7 days, exclusion: cancel between step_a and step_b):
    //
    //   Day 1: step_a(T=0), cancel(T=30m), step_b(T=1h) — old TAINTED session (outside anchor window)
    //   Day 20: step_a(T=20d), step_b(T=20d+2h) — anchor window, clean (no cancel)
    //
    // The user's anchor window is clean — they should NOT be excluded.
    // With the fix, only anchor-window pairs (f >= anchor_ms) are checked — only clean pair exists.
    const projectId = randomUUID();
    const personAnchorClean = randomUUID(); // clean anchor window — should convert despite old taint

    const now = Date.now();
    // Old tainted session: 20 days ago
    const oldA = now - 20 * DAY_MS;
    const oldCancel = oldA + 30 * 60 * 1000;        // 30m after old step-A
    const oldB = oldA + 60 * 60 * 1000;             // 1h after old step-A

    // Clean anchor window: 2 days ago
    const anchorA = now - 2 * DAY_MS;
    const anchorB = anchorA + 2 * 60 * 60 * 1000;  // 2h later, no cancel

    await insertTestEvents(ctx.ch, [
      // Old tainted session (day 1)
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_a',
        timestamp: new Date(oldA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'cancel',
        timestamp: new Date(oldCancel).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_b',
        timestamp: new Date(oldB).toISOString(),
      }),

      // Clean anchor-window (day 20)
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_a',
        timestamp: new Date(anchorA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_b',
        timestamp: new Date(anchorB).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'unordered',
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-25),
      date_to: dateOffset(1),
      timezone: 'UTC',
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // personAnchorClean has a clean anchor window → should NOT be excluded → converts
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('ordered funnel is not affected: exclusion in ordered funnel still works correctly', async () => {
    // Verify that the fix doesn't break the ordered funnel.
    // Scenario: user has step_a → cancel → step_b (ordered, single recent session).
    // Expected: user is excluded.
    const projectId = randomUUID();
    const personExcluded = randomUUID();
    const personClean = randomUUID();

    const now = Date.now();

    await insertTestEvents(ctx.ch, [
      // personExcluded: step_a → cancel → step_b (ordered, should be excluded)
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-ordered',
        event_name: 'step_a',
        timestamp: new Date(now - 5000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-ordered',
        event_name: 'cancel',
        timestamp: new Date(now - 3000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personExcluded,
        distinct_id: 'excluded-ordered',
        event_name: 'step_b',
        timestamp: new Date(now - 1000).toISOString(),
      }),

      // personClean: step_a → step_b (ordered, no cancel — should convert)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean-ordered',
        event_name: 'step_a',
        timestamp: new Date(now - 5000).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean-ordered',
        event_name: 'step_b',
        timestamp: new Date(now - 1000).toISOString(),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      funnel_order_type: 'ordered',
      steps: [
        { event_name: 'step_a', label: 'Step A' },
        { event_name: 'step_b', label: 'Step B' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;

    // personExcluded is excluded, personClean converts
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});
