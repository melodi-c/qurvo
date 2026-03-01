import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  DAY_MS,
  dateOffset,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnelTimeToConvert } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

/**
 * Tests for issue #616: TTC unordered + exclusions must use anchorFilter=true
 * in buildExcludedUsersCTE so that historical clean sessions outside the anchor
 * window do not mask tainted conversions within the anchor window.
 *
 * Without the fix, buildExcludedUsersCTE(exclusions) is called without anchorFilter,
 * so from-step timestamps from old sessions (before the anchor window) can form a
 * "clean path" that prevents exclusion of a user whose anchor-window conversion is
 * actually tainted.
 *
 * Test design note: the old session must NOT have full step coverage within the
 * conversion window (step_a and step_b >7 days apart) so that the anchor computation
 * deterministically picks the recent session as the anchor. This isolates the
 * anchorFilter bug from anchor computation logic.
 */
describe('queryFunnelTimeToConvert — unordered + exclusions: anchor-window isolation (issue #616)', () => {
  it('excludes a user whose anchor-window is tainted, despite old from-step events', async () => {
    // Timeline (funnel: step_a -> step_b, window = 7 days, exclusion: cancel between step_a and step_b):
    //
    //   20 days ago: step_a (old, standalone — no step_b within 7 days, so NO full coverage)
    //   2 days ago:  step_a, then cancel(+1h), then step_b(+2h) — anchor window, TAINTED
    //
    // The old step_a event creates a from-step timestamp in excl_0_from_arr.
    // Without anchorFilter: exclusion CTE checks pair (f=old_step_a, t=new_step_b) and
    //   may find no exclusion event between them (cancel is between NEW step_a and step_b,
    //   not between OLD step_a and step_b), creating a false "clean path".
    // With anchorFilter: only from-step timestamps within [anchor_ms, anchor_ms + window]
    //   are checked, so only the recent step_a is considered -> tainted -> excluded.
    const projectId = randomUUID();
    const personTainted = randomUUID(); // tainted anchor-window — should be excluded from TTC
    const personClean = randomUUID();   // clean anchor-window — should appear in TTC

    const now = Date.now();
    // Old standalone step_a: 20 days ago (no step_b nearby — no full coverage within 7d)
    const oldStepA = now - 20 * DAY_MS;

    // Tainted anchor-window: 2 days ago
    const anchorStepA = now - 2 * DAY_MS;
    const anchorCancel = anchorStepA + 60 * 60 * 1000;          // +1h
    const anchorStepB = anchorStepA + 2 * 60 * 60 * 1000;       // +2h

    // Clean user: 1 day ago, step_a -> step_b with 30min gap
    const cleanStepA = now - 1 * DAY_MS;
    const cleanStepB = cleanStepA + 30 * 60 * 1000; // +30m (1800s TTC)

    await insertTestEvents(ctx.ch, [
      // personTainted: old standalone step_a (no step_b nearby)
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'step_a',
        timestamp: new Date(oldStepA).toISOString(),
      }),

      // personTainted: tainted anchor-window (2 days ago)
      buildEvent({
        project_id: projectId,
        person_id: personTainted,
        distinct_id: 'tainted',
        event_name: 'step_a',
        timestamp: new Date(anchorStepA).toISOString(),
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
        timestamp: new Date(anchorStepB).toISOString(),
      }),

      // personClean: clean anchor-window only (no cancel)
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'step_a',
        timestamp: new Date(cleanStepA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personClean,
        distinct_id: 'clean',
        event_name: 'step_b',
        timestamp: new Date(cleanStepB).toISOString(),
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
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
      from_step: 0,
      to_step: 1,
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    // personTainted must be excluded (tainted anchor window)
    // personClean converts with ~1800s TTC
    // So only 1 user remains in TTC stats
    expect(result.sample_size).toBe(1);
    expect(result.average_seconds).toBeGreaterThan(0);
    // The TTC should be ~1800s (30 minutes) for personClean
    expect(result.average_seconds).toBeCloseTo(1800, -2); // within 100s tolerance
  });

  it('does NOT exclude a user whose anchor window is clean, despite old from-step events', async () => {
    // Timeline (funnel: step_a -> step_b, window = 7 days, exclusion: cancel between step_a and step_b):
    //
    //   20 days ago: step_a (old, standalone — no step_b within 7 days, so NO full coverage)
    //   Also 20 days ago: cancel event (outside any valid conversion window)
    //   2 days ago:  step_a, then step_b(+2h) — anchor window, CLEAN (no cancel)
    //
    // The user's anchor window is clean — they should NOT be excluded.
    // Without anchorFilter: the old step_a might pair with the new step_b in exclusion check,
    //   and the cancel event (which is between them) could falsely taint the pair.
    // With anchorFilter: only from-step timestamps within [anchor_ms, anchor_ms + window]
    //   are checked -> only the clean recent pair exists -> user NOT excluded.
    const projectId = randomUUID();
    const personAnchorClean = randomUUID(); // clean anchor window — should convert

    const now = Date.now();
    // Old standalone step_a + cancel: 20 days ago
    const oldStepA = now - 20 * DAY_MS;
    const oldCancel = oldStepA + 30 * 60 * 1000; // +30m (no step_b nearby)

    // Clean anchor window: 2 days ago
    const anchorStepA = now - 2 * DAY_MS;
    const anchorStepB = anchorStepA + 2 * 60 * 60 * 1000; // +2h (7200s TTC)

    await insertTestEvents(ctx.ch, [
      // Old standalone step_a + cancel (no step_b nearby, no full coverage)
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_a',
        timestamp: new Date(oldStepA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'cancel',
        timestamp: new Date(oldCancel).toISOString(),
      }),

      // Clean anchor-window (2 days ago)
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_a',
        timestamp: new Date(anchorStepA).toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personAnchorClean,
        distinct_id: 'anchor-clean',
        event_name: 'step_b',
        timestamp: new Date(anchorStepB).toISOString(),
      }),
    ]);

    const result = await queryFunnelTimeToConvert(ctx.ch, {
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
      from_step: 0,
      to_step: 1,
      exclusions: [{ event_name: 'cancel', funnel_from_step: 0, funnel_to_step: 1 }],
    });

    // personAnchorClean has a clean anchor window -> should NOT be excluded -> converts
    expect(result.sample_size).toBe(1);
    // TTC should be ~7200s (2 hours)
    expect(result.average_seconds).toBeCloseTo(7200, -2); // within 100s tolerance
  });
});
