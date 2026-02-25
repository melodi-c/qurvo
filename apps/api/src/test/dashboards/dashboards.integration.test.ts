import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupContainers, createTestProject, type ContainerContext } from '@qurvo/testing';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { DashboardNotFoundException } from '../../dashboards/exceptions/dashboard-not-found.exception';
import { WidgetNotFoundException } from '../../dashboards/exceptions/widget-not-found.exception';

let ctx: ContainerContext;
let service: DashboardsService;
let insightsService: SavedInsightsService;

beforeAll(async () => {
  ctx = await setupContainers();
  service = new DashboardsService(ctx.db as any);
  insightsService = new SavedInsightsService(ctx.db as any);
}, 120_000);

const SAMPLE_LAYOUT = { x: 0, y: 0, w: 6, h: 4 };

const SAMPLE_INSIGHT_CONFIG = {
  type: 'trend' as const,
  series: [{ event_name: '$pageview', label: 'Pageviews', filters: [] }],
  metric: 'total_events' as const,
  granularity: 'day' as const,
  chart_type: 'line' as const,
  date_from: '2025-01-01',
  date_to: '2025-01-31',
  compare: false,
};

// ── create ────────────────────────────────────────────────────────────────────

describe('DashboardsService.create', () => {
  it('creates a dashboard and returns it', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const dashboard = await service.create(userId, projectId, { name: 'Main Dashboard' });

    expect(dashboard).toBeDefined();
    expect(dashboard.id).toBeDefined();
    expect(dashboard.name).toBe('Main Dashboard');
    expect(dashboard.project_id).toBe(projectId);
    expect(dashboard.created_by).toBe(userId);
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('DashboardsService.list', () => {
  it('lists dashboards for a project', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    await service.create(userId, projectId, { name: 'Dashboard A' });
    await service.create(userId, projectId, { name: 'Dashboard B' });

    const list = await service.list(projectId);
    const names = list.map((d) => d.name);
    expect(names).toContain('Dashboard A');
    expect(names).toContain('Dashboard B');
  });

  it('returns empty array when no dashboards exist', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const list = await service.list(projectId);
    expect(list).toHaveLength(0);
  });

  it('does not return dashboards from another project', async () => {
    const { projectId: projectA, userId: userA } = await createTestProject(ctx.db);
    const { projectId: projectB, userId: userB } = await createTestProject(ctx.db);

    await service.create(userA, projectA, { name: 'A Dashboard' });
    await service.create(userB, projectB, { name: 'B Dashboard' });

    const listA = await service.list(projectA);
    const listB = await service.list(projectB);

    expect(listA.map((d) => d.name)).not.toContain('B Dashboard');
    expect(listB.map((d) => d.name)).not.toContain('A Dashboard');
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('DashboardsService.getById', () => {
  it('returns dashboard with empty widgets array', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const created = await service.create(userId, projectId, { name: 'Empty Dashboard' });

    const found = await service.getById(projectId, created.id);
    expect(found.id).toBe(created.id);
    expect(found.name).toBe('Empty Dashboard');
    expect(found.widgets).toHaveLength(0);
  });

  it('returns dashboard with nested widgets', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Dashboard With Widgets' });

    await service.addWidget(projectId, dashboard.id, { layout: SAMPLE_LAYOUT });
    await service.addWidget(projectId, dashboard.id, { layout: { x: 6, y: 0, w: 6, h: 4 } });

    const found = await service.getById(projectId, dashboard.id);
    expect(found.widgets).toHaveLength(2);
  });

  it('returns widget with linked insight when insight_id is set', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Dashboard With Insight' });
    const insight = await insightsService.create(userId, projectId, {
      type: 'trend',
      name: 'My Insight',
      config: SAMPLE_INSIGHT_CONFIG,
    });

    await service.addWidget(projectId, dashboard.id, { insight_id: insight.id, layout: SAMPLE_LAYOUT });

    const found = await service.getById(projectId, dashboard.id);
    expect(found.widgets).toHaveLength(1);
    expect(found.widgets[0].insight).toBeDefined();
    expect(found.widgets[0].insight!.id).toBe(insight.id);
  });

  it('throws DashboardNotFoundException for a non-existent id', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(service.getById(projectId, randomUUID())).rejects.toThrow(DashboardNotFoundException);
  });

  it('throws DashboardNotFoundException when dashboard belongs to another project', async () => {
    const { projectId: projectA, userId } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    const dashboard = await service.create(userId, projectA, { name: 'A Dashboard' });

    await expect(service.getById(projectB, dashboard.id)).rejects.toThrow(DashboardNotFoundException);
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('DashboardsService.update', () => {
  it('updates the dashboard name', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Old Name' });

    const updated = await service.update(projectId, dashboard.id, { name: 'New Name' });
    expect(updated.name).toBe('New Name');
  });

  it('throws DashboardNotFoundException for a non-existent dashboard', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(service.update(projectId, randomUUID(), { name: 'X' })).rejects.toThrow(DashboardNotFoundException);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe('DashboardsService.remove', () => {
  it('removes an existing dashboard', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'To Delete' });

    await expect(service.remove(projectId, dashboard.id)).resolves.toBeUndefined();

    await expect(service.getById(projectId, dashboard.id)).rejects.toThrow(DashboardNotFoundException);
  });

  it('throws DashboardNotFoundException for a non-existent dashboard', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(service.remove(projectId, randomUUID())).rejects.toThrow(DashboardNotFoundException);
  });
});

// ── addWidget ─────────────────────────────────────────────────────────────────

describe('DashboardsService.addWidget', () => {
  it('adds a widget to an existing dashboard', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Widget Host' });

    const widget = await service.addWidget(projectId, dashboard.id, { layout: SAMPLE_LAYOUT });

    expect(widget).toBeDefined();
    expect(widget.id).toBeDefined();
    expect(widget.dashboard_id).toBe(dashboard.id);
    expect(widget.layout).toEqual(SAMPLE_LAYOUT);
    expect(widget.insight_id).toBeNull();
  });

  it('adds a widget with optional content', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Content Widget' });

    const widget = await service.addWidget(projectId, dashboard.id, {
      layout: SAMPLE_LAYOUT,
      content: 'Some text content',
    });

    expect(widget.content).toBe('Some text content');
  });

  it('throws DashboardNotFoundException for a non-existent dashboard', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(
      service.addWidget(projectId, randomUUID(), { layout: SAMPLE_LAYOUT }),
    ).rejects.toThrow(DashboardNotFoundException);
  });
});

// ── updateWidget ──────────────────────────────────────────────────────────────

describe('DashboardsService.updateWidget', () => {
  it('updates the widget layout', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Update Widget Host' });
    const widget = await service.addWidget(projectId, dashboard.id, { layout: SAMPLE_LAYOUT });

    const newLayout = { x: 2, y: 2, w: 4, h: 3 };
    const updated = await service.updateWidget(projectId, dashboard.id, widget.id, { layout: newLayout });

    expect(updated.layout).toEqual(newLayout);
  });

  it('updates widget content', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Content Update Host' });
    const widget = await service.addWidget(projectId, dashboard.id, { layout: SAMPLE_LAYOUT, content: 'Original' });

    const updated = await service.updateWidget(projectId, dashboard.id, widget.id, { content: 'Updated' });
    expect(updated.content).toBe('Updated');
  });

  it('throws WidgetNotFoundException for a non-existent widget', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'No Widget Host' });

    await expect(
      service.updateWidget(projectId, dashboard.id, randomUUID(), { layout: SAMPLE_LAYOUT }),
    ).rejects.toThrow(WidgetNotFoundException);
  });

  it('throws DashboardNotFoundException for a non-existent dashboard', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(
      service.updateWidget(projectId, randomUUID(), randomUUID(), { layout: SAMPLE_LAYOUT }),
    ).rejects.toThrow(DashboardNotFoundException);
  });
});

// ── removeWidget ──────────────────────────────────────────────────────────────

describe('DashboardsService.removeWidget', () => {
  it('removes an existing widget', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Remove Widget Host' });
    const widget = await service.addWidget(projectId, dashboard.id, { layout: SAMPLE_LAYOUT });

    await expect(service.removeWidget(projectId, dashboard.id, widget.id)).resolves.toBeUndefined();

    const found = await service.getById(projectId, dashboard.id);
    expect(found.widgets.find((w) => w.id === widget.id)).toBeUndefined();
  });

  it('throws WidgetNotFoundException for a non-existent widget', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const dashboard = await service.create(userId, projectId, { name: 'Remove Widget Test' });

    await expect(service.removeWidget(projectId, dashboard.id, randomUUID())).rejects.toThrow(WidgetNotFoundException);
  });

  it('throws DashboardNotFoundException for a non-existent dashboard', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(
      service.removeWidget(projectId, randomUUID(), randomUUID()),
    ).rejects.toThrow(DashboardNotFoundException);
  });
});
