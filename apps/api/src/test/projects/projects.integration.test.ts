import { describe, it, expect, beforeAll } from 'vitest';
import { createTestProject } from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { ProjectsService } from '../../projects/projects.service';

let ctx: ContainerContext;
let service: ProjectsService;

beforeAll(async () => {
  ctx = await getTestContext();
  service = new ProjectsService(ctx.db as any, ctx.redis as any);
}, 120_000);

// ── ProjectDto includes timezone ──────────────────────────────────────────────

describe('ProjectsService — timezone field', () => {
  it('getById returns timezone field with default value UTC', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const project = await service.getById(userId, projectId);

    expect(project).toHaveProperty('timezone');
    expect(project.timezone).toBe('UTC');
  });

  it('list returns timezone field for each project', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const projects = await service.list(userId);
    const found = projects.find((p) => p.id === projectId);

    expect(found).toBeDefined();
    expect(found!.timezone).toBe('UTC');
  });

  it('update stores a valid IANA timezone', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const updated = await service.update(userId, projectId, { timezone: 'Europe/Moscow' });

    expect(updated.timezone).toBe('Europe/Moscow');
  });

  it('update stores UTC explicitly', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const updated = await service.update(userId, projectId, { timezone: 'UTC' });

    expect(updated.timezone).toBe('UTC');
  });

  it('update can change both name and timezone together', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const updated = await service.update(userId, projectId, {
      name: 'Renamed Project',
      timezone: 'America/New_York',
    });

    expect(updated.name).toBe('Renamed Project');
    expect(updated.timezone).toBe('America/New_York');
  });

  it('update without timezone leaves it unchanged', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    // First set a non-UTC timezone
    await service.update(userId, projectId, { timezone: 'Asia/Tokyo' });
    // Then update only name
    const updated = await service.update(userId, projectId, { name: 'Only Name' });

    expect(updated.timezone).toBe('Asia/Tokyo');
    expect(updated.name).toBe('Only Name');
  });
});
