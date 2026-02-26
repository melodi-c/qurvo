import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { aiMonitors } from '@qurvo/db';
import type { InsertAiMonitor } from '@qurvo/db';
import {
  insertTestEvents,
  buildEvent,
  createTestProject,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { getTestContext } from './context';
import { MonitorService } from '../monitor/monitor.service';
import { NotificationService } from '../monitor/notification.service';

let ctx: ContainerContext;
let app: INestApplicationContext;
let testProject: TestProject;
let svc: MonitorService;
let notificationSvc: NotificationService;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  app = tc.app;
  testProject = tc.testProject;
  svc = app.get(MonitorService);
  notificationSvc = app.get(NotificationService);
}, 120_000);

/**
 * Creates a monitor record in the DB for the given project and event name.
 * Returns monitorId so the caller can deactivate it after the test.
 */
async function createMonitor(
  projectId: string,
  eventName: string,
  thresholdSigma = 2.0,
  metric: 'event_count' | 'unique_users' = 'event_count',
  isActive = true,
): Promise<string> {
  const [row] = await ctx.db
    .insert(aiMonitors)
    .values({
      project_id: projectId,
      event_name: eventName,
      metric,
      threshold_sigma: thresholdSigma,
      channel_type: 'slack',
      channel_config: { webhook_url: 'https://hooks.slack.com/test' },
      is_active: isActive,
    } as InsertAiMonitor)
    .returning({ id: aiMonitors.id });
  return row.id;
}

/** Deactivates a monitor so it won't interfere with other tests. */
async function deactivateMonitor(monitorId: string): Promise<void> {
  await ctx.db
    .update(aiMonitors)
    .set({ is_active: false })
    .where(eq(aiMonitors.id, monitorId));
}

/**
 * Inserts N events for the given project and event name N days ago.
 * The monitor baseline is computed from data prior to today (days 2-29).
 */
async function insertBaselineEvents(
  projectId: string,
  eventName: string,
  countPerDay: number,
  daysBack: number,
): Promise<void> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const events = Array.from({ length: countPerDay }, (_, i) =>
    buildEvent({
      project_id: projectId,
      person_id: randomUUID(),
      event_name: eventName,
      // Place events at noon of that day
      timestamp: new Date(now - daysBack * dayMs + 12 * 60 * 60 * 1000 + i * 60_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
}

/**
 * Inserts N events for today (the "current" period, within today's window).
 */
async function insertTodayEvents(
  projectId: string,
  eventName: string,
  count: number,
): Promise<void> {
  const now = Date.now();
  const events = Array.from({ length: count }, (_, i) =>
    buildEvent({
      project_id: projectId,
      person_id: randomUUID(),
      event_name: eventName,
      // Events in the last few hours
      timestamp: new Date(now - i * 60_000 - 30_000).toISOString(),
    }),
  );
  await insertTestEvents(ctx.ch, events);
}

describe('MonitorService', () => {
  it('sends notification when z-score >= threshold', async () => {
    const tp = await createTestProject(ctx.db);
    const eventName = `anomaly_event_${randomUUID().slice(0, 8)}`;

    // Insert stable baseline for days 2-28: 100 events/day
    for (let day = 2; day <= 28; day++) {
      await insertBaselineEvents(tp.projectId, eventName, 100, day);
    }

    // Today: insert 1000 events → massive spike, z-score will be very high
    await insertTodayEvents(tp.projectId, eventName, 1000);

    // Create monitor with low threshold (sigma=2) so it triggers easily
    const monitorId = await createMonitor(tp.projectId, eventName, 2.0);

    const sendSpy = vi.spyOn(notificationSvc, 'send').mockResolvedValue(undefined);
    try {
      await svc.runCycle();
      expect(sendSpy).toHaveBeenCalled();
      // Verify the call was for our specific monitor
      const callArgs = sendSpy.mock.calls[0];
      expect(callArgs[0].id).toBe(monitorId);
    } finally {
      sendSpy.mockRestore();
      await deactivateMonitor(monitorId);
    }
  });

  it('does not send notification when z-score < threshold', async () => {
    const tp = await createTestProject(ctx.db);
    const eventName = `stable_monitor_${randomUUID().slice(0, 8)}`;

    // Insert stable baseline for days 2-28: exactly 50 events/day
    for (let day = 2; day <= 28; day++) {
      await insertBaselineEvents(tp.projectId, eventName, 50, day);
    }

    // Today: insert same amount — no deviation
    await insertTodayEvents(tp.projectId, eventName, 50);

    // Create monitor with very high threshold so it won't trigger
    const monitorId = await createMonitor(tp.projectId, eventName, 100.0);

    // We need to spy and only count calls for THIS project's monitor
    let callsForThisMonitor = 0;
    const sendSpy = vi.spyOn(notificationSvc, 'send').mockImplementation(async (monitor, ...args) => {
      if (monitor.project_id === tp.projectId) {
        callsForThisMonitor++;
      }
    });
    try {
      await svc.runCycle();
      expect(callsForThisMonitor).toBe(0);
    } finally {
      sendSpy.mockRestore();
      await deactivateMonitor(monitorId);
    }
  });

  it('skips monitor when baseline avg is 0 (no historical data)', async () => {
    const tp = await createTestProject(ctx.db);
    const eventName = `no_baseline_${randomUUID().slice(0, 8)}`;

    // No baseline events at all — only today's events
    await insertTodayEvents(tp.projectId, eventName, 10);

    const monitorId = await createMonitor(tp.projectId, eventName, 2.0);

    let callsForThisMonitor = 0;
    const sendSpy = vi.spyOn(notificationSvc, 'send').mockImplementation(async (monitor, ...args) => {
      if (monitor.project_id === tp.projectId) {
        callsForThisMonitor++;
      }
    });
    try {
      await svc.runCycle();
      // Should be skipped because baseline_avg = 0
      expect(callsForThisMonitor).toBe(0);
    } finally {
      sendSpy.mockRestore();
      await deactivateMonitor(monitorId);
    }
  });

  it('does not check inactive monitors', async () => {
    const tp = await createTestProject(ctx.db);
    const eventName = `inactive_monitor_${randomUUID().slice(0, 8)}`;

    // Insert data that would normally trigger an alert
    for (let day = 2; day <= 28; day++) {
      await insertBaselineEvents(tp.projectId, eventName, 100, day);
    }
    await insertTodayEvents(tp.projectId, eventName, 1000);

    // Create an INACTIVE monitor
    const monitorId = await createMonitor(tp.projectId, eventName, 2.0, 'event_count', false);

    let callsForThisMonitor = 0;
    const sendSpy = vi.spyOn(notificationSvc, 'send').mockImplementation(async (monitor, ...args) => {
      if (monitor.project_id === tp.projectId) {
        callsForThisMonitor++;
      }
    });
    try {
      await svc.runCycle();
      // Inactive monitor should not trigger notification
      expect(callsForThisMonitor).toBe(0);
    } finally {
      sendSpy.mockRestore();
      // Already inactive, no need to deactivate
    }
  });
});
