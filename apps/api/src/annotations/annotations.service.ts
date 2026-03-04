import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, lte, asc, or } from 'drizzle-orm';
import { annotations } from '@qurvo/db';
import type { Database, AnnotationScope } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { AnnotationNotFoundException } from './exceptions/annotation-not-found.exception';
import { resolveDateRange, isRelativeDate, resolveRelativeDate } from '../analytics/query-helpers/time';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';

export interface CreateAnnotationInput {
  date: string;
  label: string;
  description?: string;
  color?: string;
  scope?: AnnotationScope;
  insight_id?: string;
}

export interface UpdateAnnotationInput {
  date?: string;
  label?: string;
  description?: string;
  color?: string;
  scope?: AnnotationScope;
  insight_id?: string | null;
}

@Injectable()
export class AnnotationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(projectId: string, dateFrom?: string, dateTo?: string, insightId?: string) {
    const conditions = [eq(annotations.project_id, projectId)];
    if (dateFrom && dateTo) {
      const resolved = resolveDateRange(dateFrom, dateTo);
      conditions.push(gte(annotations.date, resolved.dateFrom));
      conditions.push(lte(annotations.date, resolved.dateTo));
    } else if (dateFrom) {
      conditions.push(gte(annotations.date, isRelativeDate(dateFrom) ? resolveRelativeDate(dateFrom) : dateFrom));
    } else if (dateTo) {
      conditions.push(lte(annotations.date, isRelativeDate(dateTo) ? resolveRelativeDate(dateTo) : dateTo));
    }

    if (insightId) {
      // When insight_id is provided: return insight-specific + all project-wide
      const scopeFilter = or(
        and(eq(annotations.scope, 'insight'), eq(annotations.insight_id, insightId)),
        eq(annotations.scope, 'project'),
      );
      if (scopeFilter) {conditions.push(scopeFilter);}
    } else {
      // When no insight_id: return only project-wide annotations
      conditions.push(eq(annotations.scope, 'project'));
    }

    return this.db
      .select()
      .from(annotations)
      .where(and(...conditions))
      .orderBy(asc(annotations.date));
  }

  async create(projectId: string, userId: string, input: CreateAnnotationInput) {
    const scope = input.scope ?? 'project';
    this.validateScopeInsightId(scope, input.insight_id);

    const rows = await this.db
      .insert(annotations)
      .values({
        project_id: projectId,
        created_by: userId,
        date: input.date,
        label: input.label,
        description: input.description,
        color: input.color,
        scope,
        insight_id: scope === 'insight' ? input.insight_id : null,
      })
      .returning();
    return rows[0];
  }

  async update(projectId: string, id: string, input: UpdateAnnotationInput) {
    // Determine effective scope: if scope is being changed use the new value,
    // otherwise fetch the existing annotation's scope when insight_id is provided
    // to prevent setting insight_id on a project-scoped annotation.
    let effectiveScope: AnnotationScope | undefined;

    if (input.scope !== undefined) {
      effectiveScope = input.scope;
    } else if (input.insight_id !== undefined) {
      // insight_id is being set/cleared without an explicit scope change —
      // load the current scope so we can validate the combination.
      const existing = await this.db
        .select({ scope: annotations.scope })
        .from(annotations)
        .where(and(eq(annotations.project_id, projectId), eq(annotations.id, id)));
      if (existing.length === 0) {throw new AnnotationNotFoundException();}
      effectiveScope = existing[0].scope;
    }

    if (effectiveScope !== undefined) {
      const effectiveInsightId = input.insight_id !== undefined ? input.insight_id : undefined;
      this.validateScopeInsightId(effectiveScope, effectiveInsightId ?? undefined);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.date !== undefined) {updateData['date'] = input.date;}
    if (input.label !== undefined) {updateData['label'] = input.label;}
    if (input.description !== undefined) {updateData['description'] = input.description;}
    if (input.color !== undefined) {updateData['color'] = input.color;}
    if (input.scope !== undefined) {
      updateData['scope'] = input.scope;
      // When changing to project scope, clear insight_id
      if (input.scope === 'project') {
        updateData['insight_id'] = null;
      }
    }
    if (input.insight_id !== undefined) {updateData['insight_id'] = input.insight_id;}

    const rows = await this.db
      .update(annotations)
      .set(updateData)
      .where(and(eq(annotations.project_id, projectId), eq(annotations.id, id)))
      .returning();

    if (rows.length === 0) {throw new AnnotationNotFoundException();}
    return rows[0];
  }

  async remove(projectId: string, id: string): Promise<void> {
    const rows = await this.db
      .delete(annotations)
      .where(and(eq(annotations.project_id, projectId), eq(annotations.id, id)))
      .returning({ id: annotations.id });

    if (rows.length === 0) {throw new AnnotationNotFoundException();}
  }

  private validateScopeInsightId(scope: AnnotationScope, insightId?: string | null): void {
    if (scope === 'insight' && !insightId) {
      throw new AppBadRequestException('insight_id is required when scope is "insight"');
    }
    if (scope === 'project' && insightId) {
      throw new AppBadRequestException('insight_id must not be set when scope is "project"');
    }
  }
}
