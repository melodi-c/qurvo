/**
 * HTTP-layer authorization tests for cohort endpoints.
 *
 * Bootstraps a minimal NestJS/Fastify app with only the services needed
 * for cohort auth: SessionAuthGuard, ProjectMemberGuard, CohortsController,
 * StaticCohortsController.
 * Uses Fastify's inject() for in-process HTTP calls — no port binding needed.
 *
 * Covers:
 *   - Viewer cannot call write operations (POST, PUT, DELETE) → 403
 *   - Viewer can call read operations (GET list, GET by id, GET count, GET history) → 200
 *   - Cross-project isolation: accessing a cohort from another project → 404
 *   - StaticCohortsController: viewer → all write endpoints → 403
 *   - StaticCohortsController: cross-project isolation → 403/404
 *   - StaticCohortsController: upload CSV / add members to dynamic cohort → 400
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, randomBytes } from 'crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, Module, HttpStatus } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getTestContext, type ContainerContext } from '../context';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import { REDIS } from '../../providers/redis.provider';
import { SessionAuthGuard } from '../../api/guards/session-auth.guard';
import { ProjectMemberGuard } from '../../api/guards/project-member.guard';
import { CohortsController } from '../../api/controllers/cohorts.controller';
import { StaticCohortsController } from '../../api/controllers/static-cohorts.controller';
import { CohortEnrichmentService } from '../../cohorts/cohort-enrichment.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { StaticCohortsService } from '../../cohorts/static-cohorts.service';
import { AnalyticsCacheService } from '../../analytics/analytics-cache.service';
import { ProjectsService } from '../../projects/projects.service';
import { createHttpFilter } from '../../api/filters/create-http-filter';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
import { AppUnauthorizedException } from '../../exceptions/app-unauthorized.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { users, sessions, projects, projectMembers, cohorts } from '@qurvo/db';
import { hashToken } from '../../utils/hash';
import { SESSION_TTL_MS } from '../../constants';

// ─── HTTP exception filters ─────────────────────────────────────────────────

const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
const ForbiddenFilter = createHttpFilter(HttpStatus.FORBIDDEN, AppForbiddenException);
const UnauthorizedFilter = createHttpFilter(HttpStatus.UNAUTHORIZED, AppUnauthorizedException);
const BadRequestFilter = createHttpFilter(HttpStatus.BAD_REQUEST, AppBadRequestException);

// ─── state ──────────────────────────────────────────────────────────────────

let ctx: ContainerContext;
let app: NestFastifyApplication;

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Creates a user with the given role as a member of the project.
 * Returns a valid bearer token for that user.
 */
async function createUserWithRole(
  projectId: string,
  role: 'owner' | 'editor' | 'viewer',
): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  const tokenRaw = randomBytes(32).toString('hex');
  const tokenHash = hashToken(tokenRaw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await ctx.db.insert(users).values({
    id: userId,
    email: `${role}-${userId}@example.com`,
    password_hash: 'not_used',
    display_name: `Test ${role}`,
  } as any);

  await ctx.db.insert(sessions).values({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  } as any);

  await ctx.db.insert(projectMembers).values({
    project_id: projectId,
    user_id: userId,
    role,
  } as any);

  return { userId, token: tokenRaw };
}

/**
 * Creates a project owned by a new user.
 */
async function createProject(): Promise<{ projectId: string; ownerToken: string; ownerUserId: string }> {
  const projectId = randomUUID();
  const slug = `test-${randomBytes(4).toString('hex')}`;
  const token = `tok_${randomBytes(16).toString('hex')}`;

  await ctx.db.insert(projects).values({
    id: projectId,
    name: 'Auth Test Project',
    slug,
    token,
  } as any);

  const { userId: ownerUserId, token: ownerToken } = await createUserWithRole(projectId, 'owner');

  return { projectId, ownerToken, ownerUserId };
}

/**
 * Creates a dynamic cohort via DB (bypassing HTTP guard), returns its ID.
 * Uses the correct CohortConditionGroup schema: { type, values }.
 */
async function createCohort(
  projectId: string,
  ownerUserId: string,
): Promise<string> {
  const cohortId = randomUUID();
  await ctx.db.insert(cohorts).values({
    id: cohortId,
    project_id: projectId,
    created_by: ownerUserId,
    name: 'Test Cohort',
    definition: {
      type: 'AND',
      values: [],
    },
    is_static: false,
  } as any);
  return cohortId;
}

/**
 * Creates a static cohort via DB (bypassing HTTP guard), returns its ID.
 */
async function createStaticCohort(
  projectId: string,
  ownerUserId: string,
): Promise<string> {
  const cohortId = randomUUID();
  await ctx.db.insert(cohorts).values({
    id: cohortId,
    project_id: projectId,
    created_by: ownerUserId,
    name: 'Test Static Cohort',
    definition: { type: 'AND', values: [] },
    is_static: true,
  } as any);
  return cohortId;
}

/** Convenience: make an HTTP request with a bearer token. */
function req(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token: string,
  body?: unknown,
) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  return app.inject({
    method,
    url,
    headers,
    payload: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── setup / teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await getTestContext();

  /**
   * Minimal NestJS module that exercises the HTTP auth stack for cohorts.
   * Only imports what CohortsController, SessionAuthGuard, and ProjectMemberGuard need.
   */
  @Module({
    controllers: [CohortsController, StaticCohortsController],
    providers: [
      // Infrastructure
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: CLICKHOUSE, useValue: ctx.ch },
      { provide: REDIS, useValue: ctx.redis },
      // Services
      AnalyticsCacheService,
      CohortEnrichmentService,
      CohortsService,
      StaticCohortsService,
      ProjectsService,
      // Guards
      // SessionAuthGuard: global guard via APP_GUARD (checks Bearer token)
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      // ProjectMemberGuard: registered as a provider so @UseGuards(ProjectMemberGuard) works
      ProjectMemberGuard,
      // Exception filters
      { provide: APP_FILTER, useClass: NotFoundFilter },
      { provide: APP_FILTER, useClass: ForbiddenFilter },
      { provide: APP_FILTER, useClass: UnauthorizedFilter },
      { provide: APP_FILTER, useClass: BadRequestFilter },
    ],
  })
  class CohortsTestModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [CohortsTestModule],
  }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

// ─── minimal valid definition for preview-count ─────────────────────────────
// Matches CohortConditionGroupDto: { type: 'AND' | 'OR', values: [...] }

const VALID_DEFINITION = {
  type: 'AND',
  values: [
    { type: 'person_property', property: 'email', operator: 'is_set' },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Write operations — viewer must receive 403
// ────────────────────────────────────────────────────────────────────────────

describe('Viewer → write endpoints → 403', () => {
  it('POST /api/projects/:id/cohorts → 403 for viewer', async () => {
    const { projectId } = await createProject();
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('POST', `/api/projects/${projectId}/cohorts`, viewerToken, {
      name: 'Should Fail',
      definition: VALID_DEFINITION,
    });

    expect(res.statusCode).toBe(403);
  });

  it('PUT /api/projects/:id/cohorts/:cohortId → 403 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('PUT', `/api/projects/${projectId}/cohorts/${cohortId}`, viewerToken, {
      name: 'Updated Name',
    });

    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/projects/:id/cohorts/:cohortId → 403 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('DELETE', `/api/projects/${projectId}/cohorts/${cohortId}`, viewerToken);

    expect(res.statusCode).toBe(403);
  });

  // preview-count is a read operation — intentionally accessible to viewer (no @RequireRole guard)
});

// ────────────────────────────────────────────────────────────────────────────
// Read operations — viewer must receive 200
// ────────────────────────────────────────────────────────────────────────────

describe('Viewer → read endpoints → 200', () => {
  it('GET /api/projects/:id/cohorts → 200 for viewer', async () => {
    const { projectId } = await createProject();
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('GET', `/api/projects/${projectId}/cohorts`, viewerToken);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('GET /api/projects/:id/cohorts/:cohortId → 200 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}`, viewerToken);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: cohortId, project_id: projectId });
  });

  it('GET /api/projects/:id/cohorts/:cohortId/count → 200 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/count`, viewerToken);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('count');
  });

  it('GET /api/projects/:id/cohorts/:cohortId/history → 200 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/history`, viewerToken);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /api/projects/:id/cohorts/preview-count → 200 for viewer (read-only operation)', async () => {
    const { projectId } = await createProject();
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('POST', `/api/projects/${projectId}/cohorts/preview-count`, viewerToken, {
      definition: VALID_DEFINITION,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('count');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cross-project isolation
// ────────────────────────────────────────────────────────────────────────────

describe('Cross-project isolation', () => {
  it('GET /api/projects/:otherId/cohorts/:cohortId → 404 when cohort belongs to a different project', async () => {
    // Project A with a cohort
    const { projectId: projectAId, ownerUserId: ownerAUserId } = await createProject();
    const cohortId = await createCohort(projectAId, ownerAUserId);

    // Project B with its own owner
    const { projectId: projectBId, ownerToken: ownerBToken } = await createProject();

    // User B accesses cohort from project A using project B in the URL
    const res = await req('GET', `/api/projects/${projectBId}/cohorts/${cohortId}`, ownerBToken);

    // Guard + service: cohort's project_id doesn't match projectBId → 404
    expect([403, 404]).toContain(res.statusCode);
  });

  it('User with no membership gets 404 for GET /api/projects/:id/cohorts', async () => {
    const { projectId } = await createProject();

    // Create a user that has no membership in the project
    const strangerUserId = randomUUID();
    const strangerTokenRaw = randomBytes(32).toString('hex');
    const strangerTokenHash = hashToken(strangerTokenRaw);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await ctx.db.insert(users).values({
      id: strangerUserId,
      email: `stranger-${strangerUserId}@example.com`,
      password_hash: 'not_used',
      display_name: 'Stranger',
    } as any);

    await ctx.db.insert(sessions).values({
      user_id: strangerUserId,
      token_hash: strangerTokenHash,
      expires_at: expiresAt,
    } as any);

    // Stranger accesses a project they have no membership in
    const res = await req('GET', `/api/projects/${projectId}/cohorts`, strangerTokenRaw);

    expect(res.statusCode).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// StaticCohortsController — viewer must receive 403 for all write endpoints
// ────────────────────────────────────────────────────────────────────────────

describe('StaticCohortsController — Viewer → write endpoints → 403', () => {
  it('POST /api/projects/:id/cohorts/static → 403 for viewer', async () => {
    const { projectId } = await createProject();
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('POST', `/api/projects/${projectId}/cohorts/static`, viewerToken, {
      name: 'Should Fail',
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /api/projects/:id/cohorts/:cohortId/duplicate-static → 403 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req(
      'POST',
      `/api/projects/${projectId}/cohorts/${cohortId}/duplicate-static`,
      viewerToken,
    );

    expect(res.statusCode).toBe(403);
  });

  it('POST /api/projects/:id/cohorts/:cohortId/upload-csv → 403 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req(
      'POST',
      `/api/projects/${projectId}/cohorts/${cohortId}/upload-csv`,
      viewerToken,
      { csv_content: 'person_id\nabc' },
    );

    expect(res.statusCode).toBe(403);
  });

  it('POST /api/projects/:id/cohorts/:cohortId/members → 403 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req(
      'POST',
      `/api/projects/${projectId}/cohorts/${cohortId}/members`,
      viewerToken,
      { person_ids: [randomUUID()] },
    );

    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/projects/:id/cohorts/:cohortId/members → 403 for viewer', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req(
      'DELETE',
      `/api/projects/${projectId}/cohorts/${cohortId}/members`,
      viewerToken,
      { person_ids: [randomUUID()] },
    );

    expect(res.statusCode).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// StaticCohortsController — cross-project isolation
// ────────────────────────────────────────────────────────────────────────────

describe('StaticCohortsController — cross-project isolation', () => {
  it('POST /api/projects/:otherId/cohorts/static → 404 when editor has no access to the target project', async () => {
    // Project A: editor token
    const { projectId: projectAId } = await createProject();
    const { token: editorAToken } = await createUserWithRole(projectAId, 'editor');

    // Project B: separate project the editor of A has no membership in
    const { projectId: projectBId } = await createProject();

    // Editor of A tries to create a static cohort in project B
    const res = await req(
      'POST',
      `/api/projects/${projectBId}/cohorts/static`,
      editorAToken,
      { name: 'Cross-project attack' },
    );

    // ProjectMemberGuard: no membership in project B → 404
    expect([403, 404]).toContain(res.statusCode);
  });

  it('POST /api/projects/:otherId/cohorts/:cohortId/duplicate-static → 404 when cohort belongs to a different project', async () => {
    // Project A owns the cohort
    const { projectId: projectAId, ownerUserId: ownerAUserId } = await createProject();
    const cohortId = await createCohort(projectAId, ownerAUserId);

    // Project B has its own editor
    const { projectId: projectBId } = await createProject();
    const { token: editorBToken } = await createUserWithRole(projectBId, 'editor');

    // Editor of B tries to duplicate cohort from project A using project B in the URL
    const res = await req(
      'POST',
      `/api/projects/${projectBId}/cohorts/${cohortId}/duplicate-static`,
      editorBToken,
    );

    // Service: cohort's project_id doesn't match projectBId → 404
    expect([403, 404]).toContain(res.statusCode);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// StaticCohortsController — static operations on dynamic cohorts → 400
// ────────────────────────────────────────────────────────────────────────────

describe('StaticCohortsController — static operations on dynamic cohort → 400', () => {
  it('POST /:dynamicCohortId/upload-csv → 400 (cannot import CSV to a dynamic cohort)', async () => {
    const { projectId, ownerUserId, ownerToken } = await createProject();
    const dynamicCohortId = await createCohort(projectId, ownerUserId);

    const res = await req(
      'POST',
      `/api/projects/${projectId}/cohorts/${dynamicCohortId}/upload-csv`,
      ownerToken,
      { csv_content: 'person_id\nabc' },
    );

    expect(res.statusCode).toBe(400);
  });

  it('POST /:dynamicCohortId/members → 400 (cannot add members to a dynamic cohort)', async () => {
    const { projectId, ownerUserId, ownerToken } = await createProject();
    const dynamicCohortId = await createCohort(projectId, ownerUserId);

    const res = await req(
      'POST',
      `/api/projects/${projectId}/cohorts/${dynamicCohortId}/members`,
      ownerToken,
      { person_ids: [randomUUID()] },
    );

    expect(res.statusCode).toBe(400);
  });
});
