import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  cohorts,
  isConditionGroup,
  type CohortConditionGroup,
  type Database,
} from '@qurvo/db';
import { detectCircularDependency, extractCohortReferences, validateDefinitionComplexity } from '@qurvo/cohort-query';
import { CohortNotFoundException } from './exceptions/cohort-not-found.exception';
import { CohortDefinitionRequiredException } from './exceptions/cohort-definition-required.exception';
import { StaticCohortOperationException } from './exceptions/static-cohort-operation.exception';
import { CircularCohortReferenceException } from './exceptions/circular-cohort-reference.exception';
import { countCohortMembers, countCohortMembersUnified, queryCohortSizeHistory } from './cohorts.query';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { CohortBreakdownEntry } from './cohort-breakdown.util';
import { buildConditionalUpdate } from '../utils/build-conditional-update';
import { AnalyticsCacheService } from '../analytics/analytics-cache.service';

@Injectable()
export class CohortsService {
  private readonly logger = new Logger(CohortsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly cacheService: AnalyticsCacheService,
  ) {}

  async list(projectId: string) {
    return this.db
      .select()
      .from(cohorts)
      .where(eq(cohorts.project_id, projectId))
      .orderBy(desc(cohorts.created_at));
  }

  async getById(projectId: string, cohortId: string) {
    const rows = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (rows.length === 0) {throw new CohortNotFoundException();}
    return rows[0];
  }

  async create(
    userId: string,
    projectId: string,
    input: {
      name: string;
      description?: string;
      definition?: CohortConditionGroup;
      is_static?: boolean;
    },
  ) {
    // Static cohorts always store the sentinel empty definition regardless of
    // any caller-supplied definition — their membership is managed explicitly
    // and never computed from the definition.
    const isStatic = input.is_static ?? false;
    const definition = isStatic ? null : (input.definition ?? null);

    if (!definition && !isStatic) {
      throw new CohortDefinitionRequiredException();
    }

    // Validate definition complexity (total leaf conditions + nesting depth)
    if (definition) {
      validateDefinitionComplexity(definition);
    }

    // Check circular dependency only for dynamic cohorts that reference others
    if (definition) {
      await this.checkCircularDependency('', definition, projectId);
    }

    const rows = await this.db
      .insert(cohorts)
      .values({
        project_id: projectId,
        created_by: userId,
        name: input.name,
        description: input.description ?? null,
        definition: definition ?? { type: 'AND', values: [] },
        is_static: isStatic,
      })
      .returning();

    return rows[0];
  }

  async update(
    projectId: string,
    cohortId: string,
    input: {
      name?: string;
      description?: string;
      definition?: CohortConditionGroup;
    },
  ) {
    const existing = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)));

    if (existing.length === 0) {throw new CohortNotFoundException();}

    const definition = input.definition;

    if (definition !== undefined && existing[0].is_static) {
      throw new StaticCohortOperationException('Cannot set a definition on a static cohort');
    }

    // Validate definition complexity (total leaf conditions + nesting depth)
    if (definition) {
      validateDefinitionComplexity(definition);
    }

    if (definition) {
      await this.checkCircularDependency(cohortId, definition, projectId);
    }

    const updateData = {
      updated_at: new Date(),
      ...buildConditionalUpdate(input, ['name', 'description']),
      ...(definition !== undefined && {
        definition,
        // Reset materialized membership — force fallback until recomputation
        membership_version: null,
        membership_computed_at: null,
        // Reset error tracking — definition changed, give it a fresh chance
        errors_calculating: 0,
        last_error_at: null,
        last_error_message: null,
      }),
    };

    const rows = await this.db
      .update(cohorts)
      .set(updateData)
      .where(and(eq(cohorts.id, cohortId), eq(cohorts.project_id, projectId)))
      .returning();

    // Invalidate all analytics cache entries for this project so that dashboards
    // immediately reflect the updated cohort definition instead of serving
    // stale results for up to ANALYTICS_CACHE_TTL_SECONDS (3600s).
    this.cacheService.invalidateProjectCache(projectId);

    return rows[0];
  }

  async remove(projectId: string, cohortId: string) {
    const rows = await this.db
      .delete(cohorts)
      .where(and(eq(cohorts.project_id, projectId), eq(cohorts.id, cohortId)))
      .returning({ id: cohorts.id, is_static: cohorts.is_static });

    if (rows.length === 0) {throw new CohortNotFoundException();}

    // Fire-and-forget: clean up materialized membership rows
    this.ch.command({
      query: `ALTER TABLE cohort_members DELETE WHERE cohort_id = {cohort_id:UUID}`,
      query_params: { cohort_id: cohortId },
    }).catch((err: unknown) => {
      this.logger.warn({ err, cohortId }, 'Failed to clean up cohort_members');
    });

    // Also clean up static cohort rows if applicable
    if (rows[0].is_static) {
      this.ch.command({
        query: `ALTER TABLE person_static_cohort DELETE WHERE cohort_id = {cohort_id:UUID}`,
        query_params: { cohort_id: cohortId },
      }).catch((err: unknown) => {
        this.logger.warn({ err, cohortId }, 'Failed to clean up person_static_cohort');
      });
    }
  }

  async getMemberCount(projectId: string, cohortId: string): Promise<number> {
    const cohort = await this.getById(projectId, cohortId);
    const enriched = await this.enrichDefinition(projectId, cohort.definition);
    return countCohortMembersUnified(this.ch, projectId, {
      cohort_id: cohortId,
      definition: enriched,
      materialized: cohort.membership_version !== null,
      is_static: cohort.is_static,
    });
  }

  async previewCount(
    projectId: string,
    definition: CohortConditionGroup,
  ): Promise<number> {
    validateDefinitionComplexity(definition);
    const enriched = await this.enrichDefinition(projectId, definition);
    return countCohortMembers(this.ch, projectId, enriched);
  }

  async getSizeHistory(
    projectId: string,
    cohortId: string,
    days: number = 30,
  ) {
    await this.getById(projectId, cohortId);
    return queryCohortSizeHistory(this.ch, projectId, cohortId, days);
  }

  // ── Cohort resolution for analytics queries ────────────────────────────────

  async resolveCohortFilters(
    projectId: string,
    cohortIds: string[],
  ): Promise<CohortFilterInput[]> {
    const rows = await this.getByIds(projectId, cohortIds);
    return Promise.all(
      rows.map(async (c) => ({
        cohort_id: c.id,
        definition: await this.enrichDefinition(projectId, c.definition),
        materialized: c.membership_version !== null,
        is_static: c.is_static,
        // Include membership_version so that analytics cache keys embed the
        // current materialized snapshot version.  When cohort-worker increments
        // this value the existing Redis cache entry is automatically bypassed.
        membership_version: c.membership_version ?? null,
      })),
    );
  }

  async resolveCohortBreakdowns(
    projectId: string,
    cohortIds: string[],
  ): Promise<CohortBreakdownEntry[]> {
    const rows = await this.getByIds(projectId, cohortIds);
    return Promise.all(
      rows.map(async (c) => ({
        cohort_id: c.id,
        name: c.name,
        is_static: c.is_static,
        materialized: c.membership_version !== null,
        definition: await this.enrichDefinition(projectId, c.definition),
        // Same cache-invalidation rationale as resolveCohortFilters above.
        membership_version: c.membership_version ?? null,
      })),
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async getByIds(projectId: string, cohortIds: string[]) {
    if (cohortIds.length === 0) {return [];}

    const uniqueIds = [...new Set(cohortIds)];

    const rows = await this.db
      .select()
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), inArray(cohorts.id, uniqueIds)));

    if (rows.length !== uniqueIds.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = uniqueIds.find((id) => !found.has(id));
      throw new CohortNotFoundException(`Cohort ${missing} not found`);
    }

    // Re-sort to match the caller-supplied order so that cohort breakdowns
    // assign labels to the correct buckets (bucket index === cohortIds index).
    const indexMap = new Map(cohortIds.map((id, i) => [id, i]));
    rows.sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0));

    return rows;
  }

  /**
   * Traverses a definition tree and stamps `is_static` on every
   * `{ type: 'cohort' }` condition using the provided lookup map.
   * Mutates the definition in-place (definition is already a copy
   * constructed from DB JSON, so mutation is safe).
   */
  private static stampStaticFlags(
    group: CohortConditionGroup,
    staticMap: Map<string, boolean>,
  ): void {
    for (const val of group.values) {
      if (isConditionGroup(val)) {
        CohortsService.stampStaticFlags(val, staticMap);
      } else if ((val).type === 'cohort') {
        const cond = val;
        cond.is_static = staticMap.get(cond.cohort_id) ?? false;
      }
    }
  }

  /**
   * Fetches the `is_static` flag for every cohort ID referenced inside
   * `definition` and returns a map `cohort_id → is_static`.
   * Only queries the DB when the definition actually contains `cohort` conditions.
   */
  private async resolveStaticMapForDefinition(
    projectId: string,
    definition: CohortConditionGroup,
  ): Promise<Map<string, boolean>> {
    const refIds = new Set(extractCohortReferences(definition));
    if (refIds.size === 0) {return new Map();}

    const rows = await this.db
      .select({ id: cohorts.id, is_static: cohorts.is_static })
      .from(cohorts)
      .where(and(eq(cohorts.project_id, projectId), inArray(cohorts.id, [...refIds])));

    return new Map(rows.map((r) => [r.id, r.is_static]));
  }

  /**
   * Returns a copy of `definition` with `is_static` stamped onto every
   * nested `{ type: 'cohort' }` condition.
   */
  async enrichDefinition(
    projectId: string,
    definition: CohortConditionGroup,
  ): Promise<CohortConditionGroup> {
    // Deep clone so we don't mutate the caller's object.
    const clone: CohortConditionGroup = structuredClone(definition);
    const staticMap = await this.resolveStaticMapForDefinition(projectId, clone);
    if (staticMap.size > 0) {
      CohortsService.stampStaticFlags(clone, staticMap);
    }
    return clone;
  }

  private async checkCircularDependency(
    cohortId: string,
    definition: CohortConditionGroup,
    projectId: string,
  ) {
    const isCircular = await detectCircularDependency(
      cohortId,
      definition,
      async (refId: string) => {
        try {
          const refCohort = await this.getById(projectId, refId);
          return refCohort.definition;
        } catch (err) {
          if (err instanceof CohortNotFoundException) {return null;}
          throw err;
        }
      },
    );

    if (isCircular) {
      throw new CircularCohortReferenceException();
    }
  }
}
