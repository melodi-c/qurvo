import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { aiInsights } from '@qurvo/db';
import {
  insertTestEvents,
  buildEvent,
  createTestProject,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { getTestContext } from './context';
import { InsightDiscoveryService } from '../insights/insight-discovery.service';

let ctx: ContainerContext;
let app: INestApplicationContext;
let testProject: TestProject;
let svc: InsightDiscoveryService;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  app = tc.app;
  testProject = tc.testProject;
  svc = app.get(InsightDiscoveryService);
}, 120_000);

/**
 * Insert N events for the given project in the "last 24h" window.
 * Used to set up the "current period" for metric change or new event detection.
 */
async function insertRecentEvents(projectId: string, eventName: string, count: number): Promise<void> {
  const now = Date.now();
  const events = Array.from({ length: count }, (_, i) =>
    buildEvent({
      project_id: projectId,
      person_id: randomUUID(),
      event_name: eventName,
      // Spread across last 12 hours so they are all within 24h window
      timestamp: new Date(now - (i * 60_000) - 30_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
}

/**
 * Insert N events per day across days 2-7 (baseline window for detectMetricChanges).
 * Returns the approximate average daily count inserted.
 */
async function insertBaselineEvents(
  projectId: string,
  eventName: string,
  perDay: number,
): Promise<void> {
  const now = Date.now();
  const events: ReturnType<typeof buildEvent>[] = [];

  for (let day = 2; day <= 7; day++) {
    // Place events roughly at noon of each baseline day
    const dayBaseMs = now - day * 24 * 60 * 60 * 1000;
    for (let i = 0; i < perDay; i++) {
      events.push(
        buildEvent({
          project_id: projectId,
          person_id: randomUUID(),
          event_name: eventName,
          timestamp: new Date(dayBaseMs + i * 60_000).toISOString(),
        }),
      );
    }
  }

  await insertTestEvents(ctx.ch, events);
}

/**
 * Insert events for a cohort of users in the "current week" day-0 window (14-7 days ago).
 * Returns the list of person_ids used.
 */
async function insertCurrentCohortEvents(
  projectId: string,
  eventName: string,
  count: number,
): Promise<string[]> {
  const now = Date.now();
  const personIds = Array.from({ length: count }, () => randomUUID());
  const events = personIds.map((personId, i) =>
    buildEvent({
      project_id: projectId,
      person_id: personId,
      event_name: eventName,
      // Spread across 14-7 days ago window
      timestamp: new Date(now - 14 * 24 * 60 * 60 * 1000 + i * 60_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
  return personIds;
}

/**
 * Insert events for a cohort of users in the "previous week" day-0 window (21-14 days ago).
 * Returns the list of person_ids used.
 */
async function insertPrevCohortEvents(
  projectId: string,
  eventName: string,
  count: number,
): Promise<string[]> {
  const now = Date.now();
  const personIds = Array.from({ length: count }, () => randomUUID());
  const events = personIds.map((personId, i) =>
    buildEvent({
      project_id: projectId,
      person_id: personId,
      event_name: eventName,
      // Spread across 21-14 days ago window
      timestamp: new Date(now - 21 * 24 * 60 * 60 * 1000 + i * 60_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
  return personIds;
}

/**
 * Insert retention events: person_ids return within the "last 7 days" window.
 */
async function insertRetentionEvents(
  projectId: string,
  eventName: string,
  personIds: string[],
): Promise<void> {
  const now = Date.now();
  const events = personIds.map((personId, i) =>
    buildEvent({
      project_id: projectId,
      person_id: personId,
      event_name: eventName,
      // Spread across last 6 days
      timestamp: new Date(now - 6 * 24 * 60 * 60 * 1000 + i * 60_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
}

/**
 * Insert retention events for previous cohort: person_ids return within 14-7 days ago window.
 */
async function insertPrevRetentionEvents(
  projectId: string,
  eventName: string,
  personIds: string[],
): Promise<void> {
  const now = Date.now();
  const events = personIds.map((personId, i) =>
    buildEvent({
      project_id: projectId,
      person_id: personId,
      event_name: eventName,
      // Spread across 13-8 days ago window (within 14-7 days ago range)
      timestamp: new Date(now - 13 * 24 * 60 * 60 * 1000 + i * 60_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
}

describe('InsightDiscoveryService', () => {
  describe('detectMetricChanges', () => {
    it('saves an ai_insight when event count deviates > 20% from 7d baseline', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `spike_event_${randomUUID().slice(0, 8)}`;

      // Baseline: 20 events/day for days 2-7 → avg_daily_count = 20
      await insertBaselineEvents(tp.projectId, eventName, 20);

      // Recent 24h: 50 events → pct_change = (50 - 20) / 20 = 1.5 (150% increase)
      await insertRecentEvents(tp.projectId, eventName, 50);

      await svc.detectMetricChanges(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('metric_change');
      expect(insights[0].title).toContain(eventName);
      expect(insights[0].title).toMatch(/increased/);
    });

    it('saves an ai_insight when event count drops > 20% from 7d baseline (metric decrease)', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `drop_event_${randomUUID().slice(0, 8)}`;

      // Baseline: 50 events/day for days 2-7 → avg_daily_count ≈ 50
      await insertBaselineEvents(tp.projectId, eventName, 50);

      // Recent 24h: 5 events → pct_change = (5 - 50) / 50 = -0.9 (-90% drop)
      await insertRecentEvents(tp.projectId, eventName, 5);

      await svc.detectMetricChanges(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('metric_change');
      expect(insights[0].title).toContain(eventName);
      expect(insights[0].title).toMatch(/decreased/);

      const data = insights[0].data_json as { pct_change: number };
      expect(data.pct_change).toBeLessThan(0);
    });

    it('does not save an insight when pct_change is below threshold', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `stable_event_${randomUUID().slice(0, 8)}`;

      // Baseline: 30 events/day for days 2-7 → total = 180 events, avg_daily = 180/7 ≈ 25.7
      await insertBaselineEvents(tp.projectId, eventName, 30);

      // Recent 24h: 27 events → pct_change = (27 - 25.7) / 25.7 ≈ 5%, below 20% threshold
      await insertRecentEvents(tp.projectId, eventName, 27);

      await svc.detectMetricChanges(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(0);
    });

    it('does not save an insight when baseline avg is <= 10 (noise filter)', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `rare_event_${randomUUID().slice(0, 8)}`;

      // Baseline: only 5 events/day → avg = 5, which is <= 10 threshold
      await insertBaselineEvents(tp.projectId, eventName, 5);

      // Recent 24h: 30 events (600% spike, but baseline avg is too low)
      await insertRecentEvents(tp.projectId, eventName, 30);

      await svc.detectMetricChanges(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      // Should not save because baseline avg <= 10
      expect(insights).toHaveLength(0);
    });
  });

  describe('detectNewEvents', () => {
    it('saves an ai_insight when a new event appears in the last 24h (not seen in prior 7 days)', async () => {
      const tp = await createTestProject(ctx.db);
      const newEventName = `brand_new_${randomUUID().slice(0, 8)}`;

      // Insert events only in last 24h — no baseline history
      await insertRecentEvents(tp.projectId, newEventName, 5);

      await svc.detectNewEvents(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('new_event');
      expect(insights[0].title).toContain(newEventName);
      expect(insights[0].title).toContain('New event detected');
    });

    it('does not save an insight for events that also appeared in prior 7 days', async () => {
      const tp = await createTestProject(ctx.db);
      const existingEvent = `existing_event_${randomUUID().slice(0, 8)}`;

      // Insert baseline events (days 2-7) so the event is "known"
      await insertBaselineEvents(tp.projectId, existingEvent, 5);

      // Also insert recent events
      await insertRecentEvents(tp.projectId, existingEvent, 5);

      await svc.detectNewEvents(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      // Event was seen in prior 7 days, so not "new"
      expect(insights).toHaveLength(0);
    });
  });

  describe('detectRetentionAnomalies', () => {
    it('saves a retention_anomaly insight when week-1 retention drops >20 pp week-over-week', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `retention_drop_${randomUUID().slice(0, 8)}`;

      // Previous cohort: 20 users, 18 retained (90% retention)
      const prevCohortIds = await insertPrevCohortEvents(tp.projectId, eventName, 20);
      await insertPrevRetentionEvents(tp.projectId, eventName, prevCohortIds.slice(0, 18));

      // Current cohort: 20 users, 10 retained (50% retention)
      // Drop: 90% - 50% = 40pp > 20pp threshold
      const currentCohortIds = await insertCurrentCohortEvents(tp.projectId, eventName, 20);
      await insertRetentionEvents(tp.projectId, eventName, currentCohortIds.slice(0, 10));

      await svc.detectRetentionAnomalies(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('retention_anomaly');
      expect(insights[0].title).toContain(eventName);
      expect(insights[0].title).toMatch(/Retention drop/);

      const data = insights[0].data_json as {
        retention_drop: number;
        current_retention_rate: number;
        prev_retention_rate: number;
      };
      expect(data.retention_drop).toBeGreaterThan(0.20);
      expect(data.prev_retention_rate).toBeGreaterThan(data.current_retention_rate);
    });

    it('does not save an insight when retention drop is below threshold', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `stable_retention_${randomUUID().slice(0, 8)}`;

      // Previous cohort: 20 users, 16 retained (80% retention)
      const prevCohortIds = await insertPrevCohortEvents(tp.projectId, eventName, 20);
      await insertPrevRetentionEvents(tp.projectId, eventName, prevCohortIds.slice(0, 16));

      // Current cohort: 20 users, 14 retained (70% retention)
      // Drop: 80% - 70% = 10pp < 20pp threshold
      const currentCohortIds = await insertCurrentCohortEvents(tp.projectId, eventName, 20);
      await insertRetentionEvents(tp.projectId, eventName, currentCohortIds.slice(0, 14));

      await svc.detectRetentionAnomalies(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(0);
    });

    it('does not save an insight when cohort size is too small (<10)', async () => {
      const tp = await createTestProject(ctx.db);
      const eventName = `small_cohort_${randomUUID().slice(0, 8)}`;

      // Previous cohort: only 5 users (below minimum cohort size of 10)
      const prevCohortIds = await insertPrevCohortEvents(tp.projectId, eventName, 5);
      await insertPrevRetentionEvents(tp.projectId, eventName, prevCohortIds.slice(0, 5));

      // Current cohort: 5 users, 0 retained (0% retention — extreme drop)
      await insertCurrentCohortEvents(tp.projectId, eventName, 5);

      await svc.detectRetentionAnomalies(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(0);
    });
  });

  describe('detectConversionCorrelations', () => {
    it('saves a conversion_correlation insight when intermediate event has relative lift > 50%', async () => {
      const tp = await createTestProject(ctx.db);
      const now = Date.now();
      const conversionEvent = `purchase_${randomUUID().slice(0, 8)}`;
      const intermediateEvent = `add_to_cart_${randomUUID().slice(0, 8)}`;
      const noiseEvent = `page_view_${randomUUID().slice(0, 8)}`;

      // Create 100 total users
      const allPersonIds = Array.from({ length: 100 }, () => randomUUID());

      // All 100 users do the noise event (page_view)
      await insertTestEvents(
        ctx.ch,
        allPersonIds.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: noiseEvent,
            timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      // 40 users do the intermediate event (add_to_cart)
      const intermediatePersonIds = allPersonIds.slice(0, 40);
      await insertTestEvents(
        ctx.ch,
        intermediatePersonIds.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: intermediateEvent,
            timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      // 32 of the intermediate users convert (32/40 = 80% conditional rate)
      // Only 8 of the remaining 60 users convert (8/60 ≈ 13% from non-intermediate)
      // Overall: 40 out of 100 users convert = 40% base rate
      // Relative lift: 80% / 40% - 1 = 1.0 = 100% > 50% threshold
      const convertingIntermediate = intermediatePersonIds.slice(0, 32);
      const convertingNonIntermediate = allPersonIds.slice(40, 48); // 8 users
      const allConverters = [...convertingIntermediate, ...convertingNonIntermediate];

      await insertTestEvents(
        ctx.ch,
        allConverters.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: conversionEvent,
            timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      await svc.detectConversionCorrelations(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      // Should have at least one conversion_correlation insight
      const corrInsights = insights.filter((i) => i.type === 'conversion_correlation');
      expect(corrInsights.length).toBeGreaterThan(0);

      // Find the specific correlation for our intermediate event
      const targetInsight = corrInsights.find((i) => i.title.includes(intermediateEvent));
      expect(targetInsight).toBeDefined();
      expect(targetInsight!.title).toContain(conversionEvent);

      const data = targetInsight!.data_json as {
        relative_lift: number;
        intermediate_users: number;
        conversion_event: string;
        intermediate_event: string;
      };
      expect(data.relative_lift).toBeGreaterThan(0.5);
      expect(data.intermediate_users).toBeGreaterThanOrEqual(30);
      expect(data.conversion_event).toBe(conversionEvent);
      expect(data.intermediate_event).toBe(intermediateEvent);
    });

    it('does not save an insight when sample size is below 30', async () => {
      const tp = await createTestProject(ctx.db);
      const now = Date.now();
      const conversionEvent = `checkout_${randomUUID().slice(0, 8)}`;
      const rareIntermediateEvent = `rare_step_${randomUUID().slice(0, 8)}`;

      // Create 100 total users doing a base event
      const allPersonIds = Array.from({ length: 100 }, () => randomUUID());
      await insertTestEvents(
        ctx.ch,
        allPersonIds.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: conversionEvent,
            timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      // Only 10 users do the rare intermediate event (below min_sample=30)
      // All of them convert — extremely high lift, but sample too small
      const rarePersonIds = allPersonIds.slice(0, 10);
      await insertTestEvents(
        ctx.ch,
        rarePersonIds.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: rareIntermediateEvent,
            timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      await svc.detectConversionCorrelations(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      const corrInsights = insights.filter(
        (i) => i.type === 'conversion_correlation' && (i.data_json as any)?.intermediate_event === rareIntermediateEvent,
      );
      expect(corrInsights).toHaveLength(0);
    });

    it('does not save an insight when lift is below 50%', async () => {
      const tp = await createTestProject(ctx.db);
      const now = Date.now();
      const conversionEvent = `signup_${randomUUID().slice(0, 8)}`;
      const lowLiftEvent = `browse_${randomUUID().slice(0, 8)}`;

      // 100 users total; 50 do the low-lift intermediate event, 45 convert overall
      // Intermediate: 50 users do it, 25 convert (50% rate)
      // Non-intermediate: 50 users, 20 convert (40% rate)
      // Overall base rate: 45/100 = 45%
      // Relative lift: 50% / 45% - 1 ≈ 11% < 50% threshold
      const allPersonIds = Array.from({ length: 100 }, () => randomUUID());

      const intermediatePersonIds = allPersonIds.slice(0, 50);
      const nonIntermediatePersonIds = allPersonIds.slice(50);

      // All 100 users do a base page_view
      await insertTestEvents(
        ctx.ch,
        allPersonIds.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: `base_${tp.projectId.slice(0, 8)}`,
            timestamp: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      // 50 users do the low-lift intermediate event
      await insertTestEvents(
        ctx.ch,
        intermediatePersonIds.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: lowLiftEvent,
            timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      // Converters: 25 from intermediate + 20 from non-intermediate = 45 total
      const converters = [
        ...intermediatePersonIds.slice(0, 25),
        ...nonIntermediatePersonIds.slice(0, 20),
      ];
      await insertTestEvents(
        ctx.ch,
        converters.map((pid) =>
          buildEvent({
            project_id: tp.projectId,
            person_id: pid,
            event_name: conversionEvent,
            timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ),
      );

      await svc.detectConversionCorrelations(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      const corrInsights = insights.filter(
        (i) => i.type === 'conversion_correlation' && (i.data_json as any)?.intermediate_event === lowLiftEvent,
      );
      expect(corrInsights).toHaveLength(0);
    });

    it('returns without saving when project has no events', async () => {
      const tp = await createTestProject(ctx.db);

      await svc.detectConversionCorrelations(tp.projectId, 'Test Project');

      const insights = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp.projectId));

      expect(insights).toHaveLength(0);
    });
  });

  describe('runCycle', () => {
    it('skips a project with no events without throwing', async () => {
      const tp = await createTestProject(ctx.db);

      // No events inserted — project is empty
      await expect(svc.runCycle()).resolves.not.toThrow();
    });

    it('processes multiple projects in one cycle', async () => {
      const tp1 = await createTestProject(ctx.db);
      const tp2 = await createTestProject(ctx.db);
      const event1 = `multi_cycle_a_${randomUUID().slice(0, 8)}`;
      const event2 = `multi_cycle_b_${randomUUID().slice(0, 8)}`;

      // tp1 gets a new event
      await insertRecentEvents(tp1.projectId, event1, 3);
      // tp2 gets a new event
      await insertRecentEvents(tp2.projectId, event2, 3);

      await svc.runCycle();

      const insights1 = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp1.projectId));
      const insights2 = await ctx.db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.project_id, tp2.projectId));

      // Both projects should have gotten new_event insights
      expect(insights1.some((i) => i.type === 'new_event')).toBe(true);
      expect(insights2.some((i) => i.type === 'new_event')).toBe(true);
    });
  });
});
