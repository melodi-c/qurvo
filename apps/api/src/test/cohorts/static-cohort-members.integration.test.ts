/**
 * Integration tests for GET /api/projects/:projectId/cohorts/:cohortId/members
 *
 * Tests:
 *   - Returns paginated member list with user_properties for a static cohort
 *   - Pagination (limit + offset) works correctly
 *   - Returns 400 for a dynamic cohort
 *   - Viewer can access the endpoint (no RequireRole guard)
 *   - Editor can access the endpoint
 *   - Returns empty data + total=0 for an empty static cohort
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
import { StaticCohortsController } from '../../api/controllers/static-cohorts.controller';
import { StaticCohortsService } from '../../cohorts/static-cohorts.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { ProjectsService } from '../../projects/projects.service';
import { createHttpFilter } from '../../api/filters/create-http-filter';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
import { AppUnauthorizedException } from '../../exceptions/app-unauthorized.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { users, sessions, projects, projectMembers, cohorts } from '@qurvo/db';
import { hashToken } from '../../utils/hash';
import { SESSION_TTL_MS } from '../../constants';
import { insertTestEvents, buildEvent, msAgo } from '@qurvo/testing';
import { insertStaticCohortMembers } from './helpers';

// ─── HTTP exception filters ─────────────────────────────────────────────────

const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
const ForbiddenFilter = createHttpFilter(HttpStatus.FORBIDDEN, AppForbiddenException);
const UnauthorizedFilter = createHttpFilter(HttpStatus.UNAUTHORIZED, AppUnauthorizedException);
const BadRequestFilter = createHttpFilter(HttpStatus.BAD_REQUEST, AppBadRequestException);

// ─── state ──────────────────────────────────────────────────────────────────

let ctx: ContainerContext;
let app: NestFastifyApplication;

// ─── helpers ────────────────────────────────────────────────────────────────

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

async function createProject(): Promise<{ projectId: string; ownerToken: string; ownerUserId: string }> {
  const projectId = randomUUID();
  const slug = `test-${randomBytes(4).toString('hex')}`;
  const token = `tok_${randomBytes(16).toString('hex')}`;

  await ctx.db.insert(projects).values({
    id: projectId,
    name: 'Static Members Test Project',
    slug,
    token,
  } as any);

  const { userId: ownerUserId, token: ownerToken } = await createUserWithRole(projectId, 'owner');

  return { projectId, ownerToken, ownerUserId };
}

async function createStaticCohort(projectId: string, ownerUserId: string): Promise<string> {
  const cohortId = randomUUID();
  await ctx.db.insert(cohorts).values({
    id: cohortId,
    project_id: projectId,
    created_by: ownerUserId,
    name: 'Static Test Cohort',
    definition: { type: 'AND', values: [] },
    is_static: true,
  } as any);
  return cohortId;
}

async function createDynamicCohort(projectId: string, ownerUserId: string): Promise<string> {
  const cohortId = randomUUID();
  await ctx.db.insert(cohorts).values({
    id: cohortId,
    project_id: projectId,
    created_by: ownerUserId,
    name: 'Dynamic Test Cohort',
    definition: {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    },
    is_static: false,
  } as any);
  return cohortId;
}

function req(
  method: 'GET' | 'POST' | 'DELETE',
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

  @Module({
    controllers: [StaticCohortsController],
    providers: [
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: CLICKHOUSE, useValue: ctx.ch },
      { provide: REDIS, useValue: ctx.redis },
      CohortsService,
      StaticCohortsService,
      ProjectsService,
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      ProjectMemberGuard,
      { provide: APP_FILTER, useClass: NotFoundFilter },
      { provide: APP_FILTER, useClass: ForbiddenFilter },
      { provide: APP_FILTER, useClass: UnauthorizedFilter },
      { provide: APP_FILTER, useClass: BadRequestFilter },
    ],
  })
  class StaticCohortsTestModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [StaticCohortsTestModule],
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

// ────────────────────────────────────────────────────────────────────────────
// Core functionality
// ────────────────────────────────────────────────────────────────────────────

describe('GET :cohortId/members — core functionality', () => {
  it('returns { data: [], total: 0 } for an empty static cohort', async () => {
    const { projectId, ownerToken, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/members`, ownerToken);

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number }>();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns members with user_properties for a static cohort', async () => {
    const { projectId, ownerToken, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);

    const personA = randomUUID();
    const personB = randomUUID();

    // Insert events so persons have user_properties in ClickHouse
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'alice',
        event_name: '$set',
        user_properties: JSON.stringify({ name: 'Alice', plan: 'premium' }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'bob',
        event_name: '$set',
        user_properties: JSON.stringify({ name: 'Bob', plan: 'free' }),
        timestamp: msAgo(1000),
      }),
    ]);

    await insertStaticCohortMembers(ctx.ch, projectId, cohortId, [personA, personB]);

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/members`, ownerToken);

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { person_id: string; user_properties: Record<string, unknown> }[]; total: number }>();
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);

    const personIds = body.data.map((m) => m.person_id).sort();
    expect(personIds).toEqual([personA, personB].sort());

    // Every member has user_properties
    for (const member of body.data) {
      expect(member.user_properties).toBeDefined();
      expect(typeof member.user_properties).toBe('object');
    }
  });

  it('returns 400 for a dynamic cohort', async () => {
    const { projectId, ownerToken, ownerUserId } = await createProject();
    const cohortId = await createDynamicCohort(projectId, ownerUserId);

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/members`, ownerToken);

    expect(res.statusCode).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────────────────

describe('GET :cohortId/members — pagination', () => {
  it('limit and offset correctly paginate results', async () => {
    const { projectId, ownerToken, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);

    // Create 5 persons
    const persons = Array.from({ length: 5 }, () => randomUUID());

    await insertTestEvents(ctx.ch, persons.map((pid, i) =>
      buildEvent({
        project_id: projectId,
        person_id: pid,
        distinct_id: `person-${i}`,
        event_name: '$set',
        user_properties: JSON.stringify({ index: i }),
        timestamp: msAgo((5 - i) * 1000),
      }),
    ));

    await insertStaticCohortMembers(ctx.ch, projectId, cohortId, persons);

    // Get first page (limit=2)
    const page1 = await req(
      'GET',
      `/api/projects/${projectId}/cohorts/${cohortId}/members?limit=2&offset=0`,
      ownerToken,
    );
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json<{ data: unknown[]; total: number }>();
    expect(body1.total).toBe(5);
    expect(body1.data).toHaveLength(2);

    // Get second page (limit=2, offset=2)
    const page2 = await req(
      'GET',
      `/api/projects/${projectId}/cohorts/${cohortId}/members?limit=2&offset=2`,
      ownerToken,
    );
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json<{ data: unknown[]; total: number }>();
    expect(body2.total).toBe(5);
    expect(body2.data).toHaveLength(2);

    // Get last page (limit=2, offset=4) — only 1 member remaining
    const page3 = await req(
      'GET',
      `/api/projects/${projectId}/cohorts/${cohortId}/members?limit=2&offset=4`,
      ownerToken,
    );
    expect(page3.statusCode).toBe(200);
    const body3 = page3.json<{ data: unknown[]; total: number }>();
    expect(body3.total).toBe(5);
    expect(body3.data).toHaveLength(1);
  });

  it('returns 400 for limit > 500', async () => {
    const { projectId, ownerToken, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);

    const res = await req(
      'GET',
      `/api/projects/${projectId}/cohorts/${cohortId}/members?limit=501`,
      ownerToken,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for negative offset', async () => {
    const { projectId, ownerToken, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);

    const res = await req(
      'GET',
      `/api/projects/${projectId}/cohorts/${cohortId}/members?offset=-1`,
      ownerToken,
    );
    expect(res.statusCode).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Authorization
// ────────────────────────────────────────────────────────────────────────────

describe('GET :cohortId/members — authorization', () => {
  it('viewer can access (no RequireRole guard on GET)', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);
    const { token: viewerToken } = await createUserWithRole(projectId, 'viewer');

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/members`, viewerToken);

    expect(res.statusCode).toBe(200);
  });

  it('editor can access', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);
    const { token: editorToken } = await createUserWithRole(projectId, 'editor');

    const res = await req('GET', `/api/projects/${projectId}/cohorts/${cohortId}/members`, editorToken);

    expect(res.statusCode).toBe(200);
  });

  it('unauthenticated request returns 401', async () => {
    const { projectId, ownerUserId } = await createProject();
    const cohortId = await createStaticCohort(projectId, ownerUserId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/cohorts/${cohortId}/members`,
    });

    expect(res.statusCode).toBe(401);
  });
});
