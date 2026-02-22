import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { type Database, cohorts, type CohortDefinition, type CohortCondition, type CohortPropertyCondition, type CohortEventCondition } from '@qurvo/db';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import { COHORT_MEMBERSHIP_INTERVAL_MS } from '../constants';

// ── ClickHouse SQL helpers (duplicated from apps/api — processor can't import API) ──

const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

function resolvePropertyExpr(property: string): string {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return `argMax(${property}, timestamp)`;
  }
  if (property.startsWith('properties.')) {
    const key = property.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(argMax(properties, timestamp), '${key}')`;
  }
  const key = property.startsWith('user_properties.')
    ? property.slice('user_properties.'.length)
    : property;
  return `JSONExtractString(argMax(user_properties, timestamp), '${key.replace(/'/g, "\\'")}')`;
}

function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  condIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);

  let havingClause: string;
  switch (cond.operator) {
    case 'eq':
      queryParams[pk] = cond.value ?? '';
      havingClause = `${latestExpr} = {${pk}:String}`;
      break;
    case 'neq':
      queryParams[pk] = cond.value ?? '';
      havingClause = `${latestExpr} != {${pk}:String}`;
      break;
    case 'contains':
      queryParams[pk] = `%${cond.value ?? ''}%`;
      havingClause = `${latestExpr} LIKE {${pk}:String}`;
      break;
    case 'not_contains':
      queryParams[pk] = `%${cond.value ?? ''}%`;
      havingClause = `${latestExpr} NOT LIKE {${pk}:String}`;
      break;
    case 'is_set':
      havingClause = `${latestExpr} != ''`;
      break;
    case 'is_not_set':
      havingClause = `${latestExpr} = ''`;
      break;
    default:
      havingClause = '1';
  }

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE project_id = {${projectIdParam}:UUID}
    GROUP BY person_id
    HAVING ${havingClause}`;
}

function buildEventConditionSubquery(
  cond: CohortEventCondition,
  condIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  const eventPk = `coh_${condIdx}_event`;
  const countPk = `coh_${condIdx}_count`;
  const daysPk = `coh_${condIdx}_days`;

  queryParams[eventPk] = cond.event_name;
  queryParams[countPk] = cond.count;
  queryParams[daysPk] = cond.time_window_days;

  let countOp: string;
  switch (cond.count_operator) {
    case 'gte': countOp = '>='; break;
    case 'lte': countOp = '<='; break;
    case 'eq':  countOp = '=';  break;
  }

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE
      project_id = {${projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY
    GROUP BY person_id
    HAVING count() ${countOp} {${countPk}:UInt64}`;
}

function buildConditionSubquery(
  cond: CohortCondition,
  condIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  if (cond.type === 'person_property') {
    return buildPropertyConditionSubquery(cond, condIdx, projectIdParam, queryParams);
  }
  return buildEventConditionSubquery(cond, condIdx, projectIdParam, queryParams);
}

function buildCohortSubquery(
  definition: CohortDefinition,
  cohortIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  if (definition.conditions.length === 0) {
    return `SELECT '' AS person_id WHERE 0`;
  }

  if (definition.conditions.length === 1) {
    return buildConditionSubquery(definition.conditions[0], cohortIdx * 100, projectIdParam, queryParams);
  }

  const joiner = definition.match === 'all' ? 'INTERSECT' : 'UNION ALL';
  const subqueries = definition.conditions.map((cond, i) =>
    buildConditionSubquery(cond, cohortIdx * 100 + i, projectIdParam, queryParams),
  );

  return subqueries.join(`\n${joiner}\n`);
}

// ── Service ──────────────────────────────────────────────────────────────────

const LOCK_KEY = 'cohort_membership:lock';
const LOCK_TTL_SECONDS = 300;
const INITIAL_DELAY_MS = 30_000;

@Injectable()
export class CohortMembershipService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private readonly instanceId = randomUUID();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(CohortMembershipService.name)
    private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => {
      this.runCycle().catch((err) =>
        this.logger.error({ err }, 'Initial cohort membership cycle failed'),
      );
    }, INITIAL_DELAY_MS);

    this.timer = setInterval(() => {
      this.runCycle().catch((err) =>
        this.logger.error({ err }, 'Cohort membership cycle failed'),
      );
    }, COHORT_MEMBERSHIP_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCycle(): Promise<void> {
    const hasLock = await this.tryAcquireLock();
    if (!hasLock) {
      this.logger.debug('Cohort membership cycle skipped: another instance holds the lock');
      return;
    }

    try {
      const allCohorts = await this.db.select().from(cohorts);

      if (allCohorts.length === 0) {
        this.logger.debug('No cohorts to compute membership for');
        return;
      }

      const version = Date.now();
      const activeIds: string[] = [];

      for (const cohort of allCohorts) {
        try {
          await this.computeMembership(cohort.id, cohort.project_id, cohort.definition, version);
          activeIds.push(cohort.id);
        } catch (err) {
          this.logger.error(
            { err, cohortId: cohort.id, projectId: cohort.project_id },
            'Failed to compute membership for cohort',
          );
        }
      }

      // Garbage-collect orphaned memberships
      if (activeIds.length > 0) {
        const idList = activeIds.map((id) => `'${id}'`).join(',');
        await this.ch.command({
          query: `ALTER TABLE cohort_members DELETE WHERE cohort_id NOT IN (${idList})`,
        });
      }

      this.logger.info(
        { computed: activeIds.length, total: allCohorts.length, version },
        'Cohort membership cycle completed',
      );
    } finally {
      await this.releaseLock();
    }
  }

  private async computeMembership(
    cohortId: string,
    projectId: string,
    definition: CohortDefinition,
    version: number,
  ): Promise<void> {
    const queryParams: Record<string, unknown> = { project_id: projectId };
    const subquery = buildCohortSubquery(definition, 0, 'project_id', queryParams);

    // Insert new membership rows with current version
    const insertSql = `
      INSERT INTO cohort_members (cohort_id, project_id, person_id, version)
      SELECT
        '${cohortId}' AS cohort_id,
        '${projectId}' AS project_id,
        person_id,
        ${version} AS version
      FROM (${subquery})`;

    await this.ch.query({
      query: insertSql,
      query_params: queryParams,
    });

    // Remove old versions
    await this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id = '${cohortId}' AND version < ${version}`,
    });

    // Update PostgreSQL tracking columns
    await this.db
      .update(cohorts)
      .set({
        membership_version: version,
        membership_computed_at: new Date(),
      })
      .where(eq(cohorts.id, cohortId));

    this.logger.debug({ cohortId, projectId, version }, 'Computed cohort membership');
  }

  private async tryAcquireLock(): Promise<boolean> {
    const result = await this.redis.set(
      LOCK_KEY,
      this.instanceId,
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );
    return result !== null;
  }

  private async releaseLock(): Promise<void> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, LOCK_KEY, this.instanceId);
  }
}
