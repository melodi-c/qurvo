/**
 * HTTP-layer validation tests for TrendQueryDto breakdown mutual exclusion.
 *
 * Verifies that simultaneously supplying breakdown_property and breakdown_cohort_ids
 * returns HTTP 400. Also verifies that breakdown_cohort_ids without breakdown_type='cohort'
 * returns HTTP 400.
 *
 * Bootstraps a minimal NestJS/Fastify app with TrendController, SessionAuthGuard,
 * and ProjectMemberGuard. Uses Fastify inject() — no port binding needed.
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
import { TrendController } from '../../api/controllers/trend.controller';
import { ProjectsService } from '../../projects/projects.service';
import { TREND_SERVICE } from '../../analytics/analytics.module';
import { createHttpFilter } from '../../api/filters/create-http-filter';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
import { AppUnauthorizedException } from '../../exceptions/app-unauthorized.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { users, sessions, projects, projectMembers } from '@qurvo/db';
import { hashToken } from '../../utils/hash';
import { SESSION_TTL_MS } from '../../constants';

// ─── HTTP exception filters ──────────────────────────────────────────────────

const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
const ForbiddenFilter = createHttpFilter(HttpStatus.FORBIDDEN, AppForbiddenException);
const UnauthorizedFilter = createHttpFilter(HttpStatus.UNAUTHORIZED, AppUnauthorizedException);
const BadRequestFilter = createHttpFilter(HttpStatus.BAD_REQUEST, AppBadRequestException);

// ─── state ───────────────────────────────────────────────────────────────────

let ctx: ContainerContext;
let app: NestFastifyApplication;

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createOwnerInProject(projectId: string): Promise<{ token: string }> {
  const userId = randomUUID();
  const tokenRaw = randomBytes(32).toString('hex');
  const tokenHash = hashToken(tokenRaw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await ctx.db.insert(users).values({
    id: userId,
    email: `owner-${userId}@example.com`,
    password_hash: 'not_used',
    display_name: 'Owner',
  } as any);

  await ctx.db.insert(sessions).values({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  } as any);

  await ctx.db.insert(projectMembers).values({
    project_id: projectId,
    user_id: userId,
    role: 'owner',
  } as any);

  return { token: tokenRaw };
}

async function createTestProject(): Promise<{ projectId: string; token: string }> {
  const projectId = randomUUID();
  const slug = `test-trend-val-${randomBytes(4).toString('hex')}`;
  const apiToken = `tok_${randomBytes(16).toString('hex')}`;

  await ctx.db.insert(projects).values({
    id: projectId,
    name: 'Trend Validation Test Project',
    slug,
    token: apiToken,
  } as any);

  const { token } = await createOwnerInProject(projectId);
  return { projectId, token };
}

/** Build query string for trend request */
function buildTrendUrl(projectId: string, params: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  qs.set('project_id', projectId);
  qs.set('series', JSON.stringify([{ event_name: 'pageview', label: 'Pageviews' }]));
  qs.set('metric', 'total_events');
  qs.set('granularity', 'day');
  qs.set('date_from', '2025-01-01');
  qs.set('date_to', '2025-01-31');

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      qs.set(key, JSON.stringify(value));
    } else {
      qs.set(key, value);
    }
  }

  return `/api/analytics/trend?${qs.toString()}`;
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await getTestContext();

  /**
   * Minimal NestJS module for testing TrendController DTO validation.
   * The TREND_SERVICE is mocked — we only care about the ValidationPipe rejecting bad inputs.
   */
  @Module({
    controllers: [TrendController],
    providers: [
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: CLICKHOUSE, useValue: ctx.ch },
      { provide: REDIS, useValue: ctx.redis },
      ProjectsService,
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      ProjectMemberGuard,
      // Mock TREND_SERVICE — validation happens before it is invoked
      { provide: TREND_SERVICE, useValue: { query: async () => ({ data: {}, cached_at: null, from_cache: false }) } },
      { provide: APP_FILTER, useClass: NotFoundFilter },
      { provide: APP_FILTER, useClass: ForbiddenFilter },
      { provide: APP_FILTER, useClass: UnauthorizedFilter },
      { provide: APP_FILTER, useClass: BadRequestFilter },
    ],
  })
  class TrendValidationTestModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TrendValidationTestModule],
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

// ─── mutual exclusion tests ───────────────────────────────────────────────────

describe('GET /api/analytics/trend — breakdown mutual exclusion → 400', () => {
  it('rejects request with both breakdown_property and breakdown_cohort_ids', async () => {
    const { projectId, token } = await createTestProject();
    const cohortId = randomUUID();

    const url = buildTrendUrl(projectId, {
      breakdown_property: 'browser',
      breakdown_type: 'cohort',
      breakdown_cohort_ids: [cohortId],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects breakdown_cohort_ids without breakdown_type=cohort', async () => {
    const { projectId, token } = await createTestProject();
    const cohortId = randomUUID();

    const url = buildTrendUrl(projectId, {
      breakdown_cohort_ids: [cohortId],
      // breakdown_type intentionally omitted
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects breakdown_cohort_ids with breakdown_type=property', async () => {
    const { projectId, token } = await createTestProject();
    const cohortId = randomUUID();

    const url = buildTrendUrl(projectId, {
      breakdown_type: 'property',
      breakdown_cohort_ids: [cohortId],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/analytics/trend — valid breakdown params → 200', () => {
  it('accepts breakdown_property alone (no cohort ids)', async () => {
    const { projectId, token } = await createTestProject();

    const url = buildTrendUrl(projectId, {
      breakdown_property: 'browser',
      breakdown_type: 'property',
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    // 200 or 500 from mock service — but NOT 400 (validation passed)
    expect(res.statusCode).not.toBe(400);
  });

  it('accepts breakdown_cohort_ids with breakdown_type=cohort (no breakdown_property)', async () => {
    const { projectId, token } = await createTestProject();
    const cohortId = randomUUID();

    const url = buildTrendUrl(projectId, {
      breakdown_type: 'cohort',
      breakdown_cohort_ids: [cohortId],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    // 200 or 500 from mock service — but NOT 400 (validation passed)
    expect(res.statusCode).not.toBe(400);
  });

  it('accepts no breakdown params at all', async () => {
    const { projectId, token } = await createTestProject();

    const url = buildTrendUrl(projectId, {});

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).not.toBe(400);
  });
});
