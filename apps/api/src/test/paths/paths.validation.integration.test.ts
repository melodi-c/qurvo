/**
 * HTTP-layer validation tests for PathsQueryDto path_cleaning_rules.
 *
 * Verifies that an invalid regex in PathCleaningRuleDto.regex returns HTTP 400
 * instead of propagating to ClickHouse and causing HTTP 500.
 *
 * Bootstraps a minimal NestJS/Fastify app with PathsController, SessionAuthGuard,
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
import { PathsController } from '../../api/controllers/paths.controller';
import { ProjectsService } from '../../projects/projects.service';
import { PATHS_SERVICE } from '../../analytics/analytics.module';
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
  const slug = `test-paths-val-${randomBytes(4).toString('hex')}`;
  const apiToken = `tok_${randomBytes(16).toString('hex')}`;

  await ctx.db.insert(projects).values({
    id: projectId,
    name: 'Paths Validation Test Project',
    slug,
    token: apiToken,
  } as any);

  const { token } = await createOwnerInProject(projectId);
  return { projectId, token };
}

/** Build query string for a paths request with optional path_cleaning_rules */
function buildPathsUrl(
  projectId: string,
  params: { path_cleaning_rules?: object[] } = {},
): string {
  const qs = new URLSearchParams();
  qs.set('project_id', projectId);
  qs.set('date_from', '2025-01-01');
  qs.set('date_to', '2025-01-31');

  if (params.path_cleaning_rules !== undefined) {
    qs.set('path_cleaning_rules', JSON.stringify(params.path_cleaning_rules));
  }

  return `/api/analytics/paths?${qs.toString()}`;
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await getTestContext();

  /**
   * Minimal NestJS module for testing PathsController DTO validation.
   * The PATHS_SERVICE is mocked — we only care about the ValidationPipe rejecting bad inputs.
   */
  @Module({
    controllers: [PathsController],
    providers: [
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: CLICKHOUSE, useValue: ctx.ch },
      { provide: REDIS, useValue: ctx.redis },
      ProjectsService,
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      ProjectMemberGuard,
      // Mock PATHS_SERVICE — validation happens before it is invoked
      { provide: PATHS_SERVICE, useValue: { query: async () => ({ data: {}, cached_at: null, from_cache: false }) } },
      { provide: APP_FILTER, useClass: NotFoundFilter },
      { provide: APP_FILTER, useClass: ForbiddenFilter },
      { provide: APP_FILTER, useClass: UnauthorizedFilter },
      { provide: APP_FILTER, useClass: BadRequestFilter },
    ],
  })
  class PathsValidationTestModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [PathsValidationTestModule],
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

// ─── validation tests ─────────────────────────────────────────────────────────

describe('GET /api/analytics/paths — path_cleaning_rules.regex validation → 400', () => {
  it('rejects an unclosed bracket regex [unclosed with HTTP 400', async () => {
    const { projectId, token } = await createTestProject();

    const url = buildPathsUrl(projectId, {
      path_cleaning_rules: [{ regex: '[unclosed', alias: 'Alias' }],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    // NestJS ValidationPipe returns message as an array of error strings
    const messages: string[] = Array.isArray(body.message) ? body.message : [body.message];
    expect(messages.some((m: string) => /valid regular expression/i.test(m))).toBe(true);
  });

  it('rejects a Python-style named group (?P<name>.*) regex with HTTP 400', async () => {
    const { projectId, token } = await createTestProject();

    const url = buildPathsUrl(projectId, {
      path_cleaning_rules: [{ regex: '(?P<name>.*)', alias: 'Alias' }],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    // NestJS ValidationPipe returns message as an array of error strings
    const messages: string[] = Array.isArray(body.message) ? body.message : [body.message];
    expect(messages.some((m: string) => /valid regular expression/i.test(m))).toBe(true);
  });

  it('allows a valid regex ^/shop/ to pass through without a 400', async () => {
    const { projectId, token } = await createTestProject();

    const url = buildPathsUrl(projectId, {
      path_cleaning_rules: [{ regex: '^/shop/', alias: 'Shop' }],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    // Validation passed — 200 from mock service (not 400)
    expect(res.statusCode).not.toBe(400);
  });

  it('allows a valid digit-matching regex /product/[0-9]+ to pass through', async () => {
    const { projectId, token } = await createTestProject();

    // Note: backslashes are disallowed by the existing @Matches guard, so we use [0-9]+ instead of \d+
    const url = buildPathsUrl(projectId, {
      path_cleaning_rules: [{ regex: '/product/[0-9]+', alias: 'Product page' }],
    });

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).not.toBe(400);
  });

  it('rejects a request without path_cleaning_rules with a non-400 response (baseline)', async () => {
    const { projectId, token } = await createTestProject();

    const url = buildPathsUrl(projectId);

    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });

    // No path_cleaning_rules → validation passes, mock service returns 200
    expect(res.statusCode).not.toBe(400);
  });
});
