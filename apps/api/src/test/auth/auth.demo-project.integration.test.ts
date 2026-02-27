import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getTestContext, type ContainerContext } from '../context';
import { eq } from 'drizzle-orm';
import { projects, projectMembers } from '@qurvo/db';
import { AuthService } from '../../auth/auth.service';
import { VerificationService } from '../../verification/verification.service';
import { ProjectsService } from '../../projects/projects.service';
import { DemoSeedService } from '../../demo/demo-seed.service';
import type { EmailProvider } from '../../email/email.provider.interface';

let ctx: ContainerContext;

const mockEmailProvider: EmailProvider = {
  sendEmailVerification: async () => {},
};

/**
 * Auth service with no-op email and no-op demo seeder.
 * The demoSeedService.seed is fire-and-forget — we verify project creation
 * in the DB directly, not the data seeding.
 */
function makeAuthService(c: ContainerContext): AuthService {
  const verificationService = new VerificationService(
    c.db as any,
    c.redis as any,
    mockEmailProvider,
  );
  const projectsService = new ProjectsService(c.db as any, c.redis as any);
  const demoSeedService = { seed: async () => {} } as unknown as DemoSeedService;
  return new AuthService(c.db as any, c.redis as any, verificationService, projectsService, demoSeedService);
}

function makeProjectsService(c: ContainerContext): ProjectsService {
  return new ProjectsService(c.db as any, c.redis as any);
}

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ---------------------------------------------------------------------------
// Demo project creation on registration
// ---------------------------------------------------------------------------

describe('Demo project creation on registration', () => {
  it('creates a demo project in the DB after registration', async () => {
    const authService = makeAuthService(ctx);
    const email = `demo-project-${randomUUID()}@example.com`;

    const result = await authService.register({
      email,
      password: 'secret123',
      display_name: 'Demo User',
    });

    const userId = result.user.id;

    // projectsService.create() is awaited synchronously inside auth.service.ts register(),
    // so by the time register() returns the demo project already exists in the DB.
    const userProjects = await ctx.db
      .select({
        id: projects.id,
        name: projects.name,
        is_demo: projects.is_demo,
        demo_scenario: projects.demo_scenario,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.project_id, projects.id))
      .where(eq(projectMembers.user_id, userId));

    expect(userProjects).toHaveLength(1);

    const demo = userProjects[0];
    expect(demo.is_demo).toBe(true);
    expect(demo.name).toBe('LearnFlow (Demo)');
    expect(demo.demo_scenario).toBe('online_school');
    expect(demo.role).toBe('owner');
  });

  it('creates a demo project for every registered user (no collision on concurrent registrations)', async () => {
    const authService = makeAuthService(ctx);

    // Register two users in parallel — both should get their own demo project
    const [result1, result2] = await Promise.all([
      authService.register({
        email: `demo-parallel-a-${randomUUID()}@example.com`,
        password: 'pass1',
        display_name: 'User A',
      }),
      authService.register({
        email: `demo-parallel-b-${randomUUID()}@example.com`,
        password: 'pass2',
        display_name: 'User B',
      }),
    ]);

    const [projectsA, projectsB] = await Promise.all([
      ctx.db
        .select({ id: projects.id, is_demo: projects.is_demo })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.project_id, projects.id))
        .where(eq(projectMembers.user_id, result1.user.id)),
      ctx.db
        .select({ id: projects.id, is_demo: projects.is_demo })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.project_id, projects.id))
        .where(eq(projectMembers.user_id, result2.user.id)),
    ]);

    expect(projectsA).toHaveLength(1);
    expect(projectsB).toHaveLength(1);

    expect(projectsA[0].is_demo).toBe(true);
    expect(projectsB[0].is_demo).toBe(true);

    // Each user owns a distinct project (different IDs)
    expect(projectsA[0].id).not.toBe(projectsB[0].id);
  });

  it('lists the demo project via ProjectsService.list()', async () => {
    const authService = makeAuthService(ctx);
    const projectsService = makeProjectsService(ctx);

    const email = `demo-list-${randomUUID()}@example.com`;
    const result = await authService.register({
      email,
      password: 'secret123',
      display_name: 'List User',
    });

    const userId = result.user.id;
    const list = await projectsService.list(userId);

    expect(list).toHaveLength(1);
    expect(list[0].is_demo).toBe(true);
    expect(list[0].name).toBe('LearnFlow (Demo)');
    expect(list[0].role).toBe('owner');
  });

  it('creates two projects with the same name for different users without throwing', async () => {
    const projectsService = makeProjectsService(ctx);

    const authService = makeAuthService(ctx);

    const [result1, result2] = await Promise.all([
      authService.register({
        email: `same-name-a-${randomUUID()}@example.com`,
        password: 'pass1',
        display_name: 'User A',
      }),
      authService.register({
        email: `same-name-b-${randomUUID()}@example.com`,
        password: 'pass2',
        display_name: 'User B',
      }),
    ]);

    // Create projects with identical names in parallel — no slug collision anymore
    const [p1, p2] = await Promise.all([
      projectsService.create(result1.user.id, { name: 'Same Name', is_demo: false }),
      projectsService.create(result2.user.id, { name: 'Same Name', is_demo: false }),
    ]);

    expect(p1.id).toBeTruthy();
    expect(p2.id).toBeTruthy();
    expect(p1.id).not.toBe(p2.id);
    expect(p1.name).toBe('Same Name');
    expect(p2.name).toBe('Same Name');
  });
});
