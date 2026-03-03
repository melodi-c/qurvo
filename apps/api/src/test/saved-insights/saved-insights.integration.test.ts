import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { InsightNotFoundException } from '../../saved-insights/exceptions/insight-not-found.exception';

let ctx: ContainerContext;
let service: SavedInsightsService;

beforeAll(async () => {
  ctx = await getTestContext();
  service = new SavedInsightsService(ctx.db as any);
}, 120_000);

const SAMPLE_CONFIG = {
  type: 'trend' as const,
  series: [{ event_name: '$pageview', label: 'Pageviews', metric: 'total_events' as const, filters: [] }],
  granularity: 'day' as const,
  chart_type: 'line' as const,
  date_from: '2025-01-01',
  date_to: '2025-01-31',
  compare: false,
};

// ── create ────────────────────────────────────────────────────────────────────

describe('SavedInsightsService.create', () => {
  it('creates an insight and returns it', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const insight = await service.create(userId, projectId, {
      type: 'trend',
      name: 'Daily Pageviews',
      config: SAMPLE_CONFIG,
    });

    expect(insight).toBeDefined();
    expect(insight.id).toBeDefined();
    expect(insight.name).toBe('Daily Pageviews');
    expect(insight.type).toBe('trend');
    expect(insight.project_id).toBe(projectId);
    expect(insight.created_by).toBe(userId);
    expect(insight.is_favorite).toBe(false);
  });

  it('stores the optional description field', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const insight = await service.create(userId, projectId, {
      type: 'funnel',
      name: 'Signup Funnel',
      description: 'Tracks the signup conversion',
      config: {
        type: 'funnel',
        steps: [{ event_name: 'signup_start', label: 'Start' }],
        conversion_window_days: 7,
        date_from: '2025-01-01',
        date_to: '2025-01-31',
      },
    });

    expect(insight.description).toBe('Tracks the signup conversion');
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('SavedInsightsService.list', () => {
  it('lists all insights for a project', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    await service.create(userId, projectId, { type: 'trend', name: 'Insight A', config: SAMPLE_CONFIG });
    await service.create(userId, projectId, { type: 'funnel', name: 'Insight B', config: {
      type: 'funnel', steps: [], conversion_window_days: 7, date_from: '2025-01-01', date_to: '2025-01-31',
    } });

    const list = await service.list(projectId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const names = list.map((i) => i.name);
    expect(names).toContain('Insight A');
    expect(names).toContain('Insight B');
  });

  it('filters by type when type is provided', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    await service.create(userId, projectId, { type: 'trend', name: 'Trend One', config: SAMPLE_CONFIG });
    await service.create(userId, projectId, { type: 'funnel', name: 'Funnel One', config: {
      type: 'funnel', steps: [], conversion_window_days: 7, date_from: '2025-01-01', date_to: '2025-01-31',
    } });

    const trends = await service.list(projectId, 'trend');
    expect(trends.every((i) => i.type === 'trend')).toBe(true);
    expect(trends.map((i) => i.name)).toContain('Trend One');
    expect(trends.map((i) => i.name)).not.toContain('Funnel One');
  });

  it('returns empty array for a project with no insights', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const list = await service.list(projectId);
    expect(list).toHaveLength(0);
  });

  it('does not return insights from another project', async () => {
    const { projectId: projectA, userId: userA } = await createTestProject(ctx.db);
    const { projectId: projectB, userId: userB } = await createTestProject(ctx.db);

    await service.create(userA, projectA, { type: 'trend', name: 'A Insight', config: SAMPLE_CONFIG });
    await service.create(userB, projectB, { type: 'trend', name: 'B Insight', config: SAMPLE_CONFIG });

    const listA = await service.list(projectA);
    const listB = await service.list(projectB);

    expect(listA.map((i) => i.name)).not.toContain('B Insight');
    expect(listB.map((i) => i.name)).not.toContain('A Insight');
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('SavedInsightsService.getById', () => {
  it('returns the insight by id', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const created = await service.create(userId, projectId, { type: 'trend', name: 'My Trend', config: SAMPLE_CONFIG });

    const found = await service.getById(projectId, created.id);
    expect(found.id).toBe(created.id);
    expect(found.name).toBe('My Trend');
  });

  it('throws InsightNotFoundException for a non-existent id', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(service.getById(projectId, randomUUID())).rejects.toThrow(InsightNotFoundException);
  });

  it('throws InsightNotFoundException when insight belongs to a different project', async () => {
    const { projectId: projectA, userId } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    const insight = await service.create(userId, projectA, { type: 'trend', name: 'A Insight', config: SAMPLE_CONFIG });

    await expect(service.getById(projectB, insight.id)).rejects.toThrow(InsightNotFoundException);
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('SavedInsightsService.update', () => {
  it('updates the name of an insight', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insight = await service.create(userId, projectId, { type: 'trend', name: 'Old Name', config: SAMPLE_CONFIG });

    const updated = await service.update(projectId, insight.id, { name: 'New Name' });
    expect(updated.name).toBe('New Name');
  });

  it('marks an insight as favorite', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insight = await service.create(userId, projectId, { type: 'trend', name: 'Fav Test', config: SAMPLE_CONFIG });

    const updated = await service.update(projectId, insight.id, { is_favorite: true });
    expect(updated.is_favorite).toBe(true);
  });

  it('updates description', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insight = await service.create(userId, projectId, { type: 'trend', name: 'Desc Test', config: SAMPLE_CONFIG });

    const updated = await service.update(projectId, insight.id, { description: 'A new description' });
    expect(updated.description).toBe('A new description');
  });

  it('throws InsightNotFoundException for a non-existent insight', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(service.update(projectId, randomUUID(), { name: 'X' })).rejects.toThrow(InsightNotFoundException);
  });
});

// ── duplicate ─────────────────────────────────────────────────────────────────

describe('SavedInsightsService.duplicate', () => {
  it('creates a copy of an existing insight', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const source = await service.create(userId, projectId, {
      type: 'trend',
      name: 'Original Insight',
      description: 'Some description',
      config: SAMPLE_CONFIG,
    });

    const copy = await service.duplicate(userId, projectId, source.id);

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Copy of Original Insight');
    expect(copy.type).toBe(source.type);
    expect(copy.config).toEqual(source.config);
    expect(copy.description).toBe(source.description);
    expect(copy.created_by).toBe(userId);
    expect(copy.is_favorite).toBe(false);
    expect(copy.project_id).toBe(projectId);
  });

  it('sets created_by to the duplicating user, not the original creator', async () => {
    const { projectId, userId: creator } = await createTestProject(ctx.db);
    const { userId: otherUser } = await createTestProject(ctx.db);
    const source = await service.create(creator, projectId, {
      type: 'trend',
      name: 'Creator Insight',
      config: SAMPLE_CONFIG,
    });

    const copy = await service.duplicate(otherUser, projectId, source.id);

    expect(copy.created_by).toBe(otherUser);
  });

  it('resets is_favorite to false even if source is favorited', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const source = await service.create(userId, projectId, {
      type: 'trend',
      name: 'Fav Insight',
      config: SAMPLE_CONFIG,
    });
    await service.update(projectId, source.id, { is_favorite: true });

    const copy = await service.duplicate(userId, projectId, source.id);
    expect(copy.is_favorite).toBe(false);
  });

  it('truncates name to 200 characters', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const longName = 'A'.repeat(200);
    const source = await service.create(userId, projectId, {
      type: 'trend',
      name: longName,
      config: SAMPLE_CONFIG,
    });

    const copy = await service.duplicate(userId, projectId, source.id);

    expect(copy.name.length).toBeLessThanOrEqual(200);
    expect(copy.name).toBe(`Copy of ${longName}`.slice(0, 200));
  });

  it('throws InsightNotFoundException for non-existent source', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    await expect(service.duplicate(userId, projectId, randomUUID())).rejects.toThrow(InsightNotFoundException);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe('SavedInsightsService.remove', () => {
  it('removes an existing insight', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insight = await service.create(userId, projectId, { type: 'trend', name: 'To Delete', config: SAMPLE_CONFIG });

    await expect(service.remove(projectId, insight.id)).resolves.toBeUndefined();

    await expect(service.getById(projectId, insight.id)).rejects.toThrow(InsightNotFoundException);
  });

  it('throws InsightNotFoundException for a non-existent insight', async () => {
    const { projectId } = await createTestProject(ctx.db);
    await expect(service.remove(projectId, randomUUID())).rejects.toThrow(InsightNotFoundException);
  });
});
