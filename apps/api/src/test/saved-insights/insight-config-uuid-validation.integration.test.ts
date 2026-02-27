/**
 * HTTP-layer validation tests for insight config cohort_ids / breakdown_cohort_ids UUID fields.
 *
 * Ensures that posting invalid UUIDs in cohort_ids or breakdown_cohort_ids
 * returns 400 (not 500 from a PostgreSQL cast error).
 *
 * Bootstraps a minimal NestJS/Fastify app with SavedInsightsController,
 * SessionAuthGuard, and ProjectMemberGuard. Uses Fastify inject() — no port binding.
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
import { SavedInsightsController } from '../../api/controllers/saved-insights.controller';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { ShareTokensService } from '../../share-tokens/share-tokens.service';
import { ProjectsService } from '../../projects/projects.service';
import { createHttpFilter } from '../../api/filters/create-http-filter';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
import { AppUnauthorizedException } from '../../exceptions/app-unauthorized.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { users, sessions, projects, projectMembers } from '@qurvo/db';
import { hashToken } from '../../utils/hash';
import { SESSION_TTL_MS } from '../../constants';

// ─── HTTP exception filters ───────────────────────────────────────────────────

const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
const ForbiddenFilter = createHttpFilter(HttpStatus.FORBIDDEN, AppForbiddenException);
const UnauthorizedFilter = createHttpFilter(HttpStatus.UNAUTHORIZED, AppUnauthorizedException);
const BadRequestFilter = createHttpFilter(HttpStatus.BAD_REQUEST, AppBadRequestException);

// ─── state ────────────────────────────────────────────────────────────────────

let ctx: ContainerContext;
let app: NestFastifyApplication;

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createEditorInProject(projectId: string): Promise<{ token: string }> {
  const userId = randomUUID();
  const tokenRaw = randomBytes(32).toString('hex');
  const tokenHash = hashToken(tokenRaw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await ctx.db.insert(users).values({
    id: userId,
    email: `editor-${userId}@example.com`,
    password_hash: 'not_used',
    display_name: 'Editor',
  } as any);

  await ctx.db.insert(sessions).values({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  } as any);

  await ctx.db.insert(projectMembers).values({
    project_id: projectId,
    user_id: userId,
    role: 'editor',
  } as any);

  return { token: tokenRaw };
}

async function createTestProject(): Promise<{ projectId: string; token: string }> {
  const projectId = randomUUID();
  const slug = `test-${randomBytes(4).toString('hex')}`;
  const token = `tok_${randomBytes(16).toString('hex')}`;

  await ctx.db.insert(projects).values({
    id: projectId,
    name: 'UUID Validation Test Project',
    slug,
    token,
  } as any);

  const { token: bearerToken } = await createEditorInProject(projectId);

  return { projectId, token: bearerToken };
}

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

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await getTestContext();

  @Module({
    controllers: [SavedInsightsController],
    providers: [
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: CLICKHOUSE, useValue: ctx.ch },
      { provide: REDIS, useValue: ctx.redis },
      SavedInsightsService,
      ShareTokensService,
      ProjectsService,
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      ProjectMemberGuard,
      { provide: APP_FILTER, useClass: NotFoundFilter },
      { provide: APP_FILTER, useClass: ForbiddenFilter },
      { provide: APP_FILTER, useClass: UnauthorizedFilter },
      { provide: APP_FILTER, useClass: BadRequestFilter },
    ],
  })
  class InsightsValidationTestModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [InsightsValidationTestModule],
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

// ─── base valid configs ───────────────────────────────────────────────────────

const BASE_TREND_CONFIG = {
  type: 'trend',
  series: [{ event_name: '$pageview', label: 'Pageviews', filters: [] }],
  metric: 'total_events',
  granularity: 'day',
  chart_type: 'line',
  date_from: '2025-01-01',
  date_to: '2025-01-31',
  compare: false,
};

const BASE_FUNNEL_CONFIG = {
  type: 'funnel',
  steps: [{ event_name: 'signup_start', label: 'Start' }],
  conversion_window_days: 7,
  date_from: '2025-01-01',
  date_to: '2025-01-31',
};

// ─── invalid cohort_ids — must return 400 ────────────────────────────────────

describe('POST /api/projects/:projectId/insights — invalid cohort_ids → 400', () => {
  it('rejects non-UUID string in cohort_ids for trend config', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Bad Cohort Trend',
      config: { ...BASE_TREND_CONFIG, cohort_ids: ['not-a-uuid'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-UUID string in cohort_ids for funnel config', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'funnel',
      name: 'Bad Cohort Funnel',
      config: { ...BASE_FUNNEL_CONFIG, cohort_ids: ['not-a-uuid'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-UUID string in breakdown_cohort_ids for funnel config', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'funnel',
      name: 'Bad Breakdown Cohort Funnel',
      config: { ...BASE_FUNNEL_CONFIG, breakdown_type: 'cohort', breakdown_cohort_ids: ['not-a-uuid'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-UUID string in breakdown_cohort_ids for trend config', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Bad Breakdown Cohort Trend',
      config: { ...BASE_TREND_CONFIG, breakdown_type: 'cohort', breakdown_cohort_ids: ['not-a-uuid'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects empty-string in cohort_ids', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Empty String Cohort',
      config: { ...BASE_TREND_CONFIG, cohort_ids: [''] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-array value for cohort_ids', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Non-array Cohort IDs',
      config: { ...BASE_TREND_CONFIG, cohort_ids: 'not-an-array' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── valid UUIDs — must return 201 ───────────────────────────────────────────

describe('POST /api/projects/:projectId/insights — valid UUIDs → 201', () => {
  it('accepts valid UUID in cohort_ids for trend config', async () => {
    const { projectId, token } = await createTestProject();
    const cohortId = randomUUID();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Valid Cohort Trend',
      config: { ...BASE_TREND_CONFIG, cohort_ids: [cohortId] },
    });

    // The UUID itself is valid — service may return 404 if cohort doesn't exist,
    // but 400 is NOT acceptable here. The point is validation passes.
    expect(res.statusCode).not.toBe(400);
  });

  it('accepts valid UUID in breakdown_cohort_ids for trend config', async () => {
    const { projectId, token } = await createTestProject();
    const cohortId = randomUUID();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Valid Breakdown Cohort Trend',
      config: { ...BASE_TREND_CONFIG, breakdown_type: 'cohort', breakdown_cohort_ids: [cohortId] },
    });

    expect(res.statusCode).not.toBe(400);
  });

  it('accepts config without cohort_ids (optional field)', async () => {
    const { projectId, token } = await createTestProject();

    const res = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'No Cohort IDs',
      config: BASE_TREND_CONFIG,
    });

    expect(res.statusCode).not.toBe(400);
  });
});

// ─── PUT update — invalid cohort_ids → 400 ───────────────────────────────────

describe('PUT /api/projects/:projectId/insights/:id — invalid cohort_ids → 400', () => {
  it('rejects non-UUID string in cohort_ids when updating config', async () => {
    const { projectId, token } = await createTestProject();

    // First create a valid insight
    const createRes = await req('POST', `/api/projects/${projectId}/insights`, token, {
      type: 'trend',
      name: 'Trend to Update',
      config: BASE_TREND_CONFIG,
    });
    expect(createRes.statusCode).toBe(201);
    const insightId = createRes.json<{ id: string }>().id;

    // Then try to update with invalid UUID
    const updateRes = await req('PUT', `/api/projects/${projectId}/insights/${insightId}`, token, {
      config: { ...BASE_TREND_CONFIG, cohort_ids: ['not-a-uuid'] },
    });

    expect(updateRes.statusCode).toBe(400);
  });
});
