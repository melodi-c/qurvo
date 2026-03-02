import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject } from '@qurvo/testing';
import { insights } from '@qurvo/db';
import { getTestContext, type ContainerContext } from '../context';
import { AnnotationsService } from '../../annotations/annotations.service';
import { AnnotationNotFoundException } from '../../annotations/exceptions/annotation-not-found.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

let ctx: ContainerContext;
let service: AnnotationsService;

beforeAll(async () => {
  ctx = await getTestContext();
  service = new AnnotationsService(ctx.db as any);
}, 120_000);

const SAMPLE_INSIGHT_CONFIG = {
  type: 'trend' as const,
  series: [{ event_name: '$pageview', label: 'Pageviews', metric: 'total_events' as const, filters: [] }],
  granularity: 'day' as const,
  chart_type: 'line' as const,
  date_from: '2025-01-01',
  date_to: '2025-01-31',
  compare: false,
};

async function createTestInsight(db: any, projectId: string, userId: string): Promise<string> {
  const rows = await db
    .insert(insights)
    .values({
      project_id: projectId,
      created_by: userId,
      type: 'trend',
      name: 'Test Insight',
      config: SAMPLE_INSIGHT_CONFIG,
    })
    .returning();
  return rows[0].id;
}

// ── create ────────────────────────────────────────────────────────────────────

describe('AnnotationsService.create', () => {
  it('creates a project-scoped annotation by default', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const annotation = await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Launch day',
    });

    expect(annotation).toBeDefined();
    expect(annotation.scope).toBe('project');
    expect(annotation.insight_id).toBeNull();
    expect(annotation.label).toBe('Launch day');
  });

  it('creates an insight-scoped annotation with insight_id', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);

    const annotation = await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Spike in pageviews',
      scope: 'insight',
      insight_id: insightId,
    });

    expect(annotation.scope).toBe('insight');
    expect(annotation.insight_id).toBe(insightId);
  });

  it('rejects insight scope without insight_id', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    await expect(
      service.create(projectId, userId, {
        date: '2025-06-15',
        label: 'Missing insight',
        scope: 'insight',
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('rejects project scope with insight_id', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);

    await expect(
      service.create(projectId, userId, {
        date: '2025-06-15',
        label: 'Invalid combo',
        scope: 'project',
        insight_id: insightId,
      }),
    ).rejects.toThrow(AppBadRequestException);
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('AnnotationsService.list', () => {
  it('returns only project-scoped annotations when no insight_id provided', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);

    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Project annotation',
      scope: 'project',
    });
    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Insight annotation',
      scope: 'insight',
      insight_id: insightId,
    });

    const list = await service.list(projectId);
    expect(list.length).toBe(1);
    expect(list[0].label).toBe('Project annotation');
    expect(list[0].scope).toBe('project');
  });

  it('returns insight-specific + project-wide when insight_id provided', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);
    const otherInsightId = await createTestInsight(ctx.db, projectId, userId);

    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Project wide',
      scope: 'project',
    });
    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'For this insight',
      scope: 'insight',
      insight_id: insightId,
    });
    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'For other insight',
      scope: 'insight',
      insight_id: otherInsightId,
    });

    const list = await service.list(projectId, undefined, undefined, insightId);
    expect(list.length).toBe(2);
    const labels = list.map((a) => a.label).sort();
    expect(labels).toEqual(['For this insight', 'Project wide']);
  });

  it('respects date range filters', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    await service.create(projectId, userId, { date: '2025-01-01', label: 'Jan' });
    await service.create(projectId, userId, { date: '2025-06-15', label: 'Jun' });
    await service.create(projectId, userId, { date: '2025-12-31', label: 'Dec' });

    const list = await service.list(projectId, '2025-03-01', '2025-09-01');
    expect(list.length).toBe(1);
    expect(list[0].label).toBe('Jun');
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('AnnotationsService.update', () => {
  it('updates scope from project to insight', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);

    const annotation = await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Will become insight-scoped',
    });

    const updated = await service.update(projectId, annotation.id, {
      scope: 'insight',
      insight_id: insightId,
    });

    expect(updated.scope).toBe('insight');
    expect(updated.insight_id).toBe(insightId);
  });

  it('clears insight_id when changing scope to project', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);

    const annotation = await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Was insight-scoped',
      scope: 'insight',
      insight_id: insightId,
    });

    const updated = await service.update(projectId, annotation.id, {
      scope: 'project',
    });

    expect(updated.scope).toBe('project');
    expect(updated.insight_id).toBeNull();
  });

  it('rejects changing to insight scope without insight_id', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const annotation = await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Project annotation',
    });

    await expect(
      service.update(projectId, annotation.id, { scope: 'insight' }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('throws AnnotationNotFoundException for non-existent id', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await expect(
      service.update(projectId, randomUUID(), { label: 'nope' }),
    ).rejects.toThrow(AnnotationNotFoundException);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('AnnotationsService.remove', () => {
  it('removes an existing annotation', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const annotation = await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'To be deleted',
    });

    await service.remove(projectId, annotation.id);

    const list = await service.list(projectId);
    expect(list.find((a) => a.id === annotation.id)).toBeUndefined();
  });

  it('throws AnnotationNotFoundException for non-existent id', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await expect(
      service.remove(projectId, randomUUID()),
    ).rejects.toThrow(AnnotationNotFoundException);
  });
});

// ── cascade delete ───────────────────────────────────────────────────────────

describe('AnnotationsService cascade', () => {
  it('deletes insight-scoped annotations when the insight is deleted', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const insightId = await createTestInsight(ctx.db, projectId, userId);

    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Will cascade',
      scope: 'insight',
      insight_id: insightId,
    });
    await service.create(projectId, userId, {
      date: '2025-06-15',
      label: 'Should survive',
      scope: 'project',
    });

    // Delete the insight directly
    const { eq } = await import('drizzle-orm');
    await (ctx.db as any).delete(insights).where(eq(insights.id, insightId));

    const list = await service.list(projectId);
    expect(list.length).toBe(1);
    expect(list[0].label).toBe('Should survive');
  });
});
