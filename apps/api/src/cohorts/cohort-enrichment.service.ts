import { Injectable, Inject } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import {
  cohorts,
  isConditionGroup,
  type CohortConditionGroup,
  type Database,
} from '@qurvo/db';
import { extractCohortReferences } from '@qurvo/cohort-query';

@Injectable()
export class CohortEnrichmentService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
      CohortEnrichmentService.stampStaticFlags(clone, staticMap);
    }
    return clone;
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
        CohortEnrichmentService.stampStaticFlags(val, staticMap);
      } else if ((val).type === 'cohort') {
        const cond = val;
        cond.is_static = staticMap.get(cond.cohort_id) ?? false;
      }
    }
  }
}
