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
