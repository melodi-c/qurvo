import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { annotations } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { AnnotationNotFoundException } from './exceptions/annotation-not-found.exception';

export interface CreateAnnotationInput {
  date: string;
  label: string;
  description?: string;
  color?: string;
}

export interface UpdateAnnotationInput {
  date?: string;
  label?: string;
  description?: string;
  color?: string;
}

@Injectable()
export class AnnotationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(projectId: string, dateFrom?: string, dateTo?: string) {
    const conditions = [eq(annotations.project_id, projectId)];
    if (dateFrom) conditions.push(gte(annotations.date, dateFrom));
    if (dateTo) conditions.push(lte(annotations.date, dateTo));

    return this.db
      .select()
      .from(annotations)
      .where(and(...conditions))
      .orderBy(asc(annotations.date));
  }

  async create(projectId: string, userId: string, input: CreateAnnotationInput) {
    const rows = await this.db
      .insert(annotations)
      .values({
        project_id: projectId,
        created_by: userId,
        date: input.date,
        label: input.label,
        description: input.description,
        color: input.color,
      })
      .returning();
    return rows[0];
  }

  async update(projectId: string, id: string, input: UpdateAnnotationInput) {
    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.date !== undefined) updateData['date'] = input.date;
    if (input.label !== undefined) updateData['label'] = input.label;
    if (input.description !== undefined) updateData['description'] = input.description;
    if (input.color !== undefined) updateData['color'] = input.color;

    const rows = await this.db
      .update(annotations)
      .set(updateData)
      .where(and(eq(annotations.project_id, projectId), eq(annotations.id, id)))
      .returning();

    if (rows.length === 0) throw new AnnotationNotFoundException();
    return rows[0];
  }

  async remove(projectId: string, id: string): Promise<void> {
    const rows = await this.db
      .delete(annotations)
      .where(and(eq(annotations.project_id, projectId), eq(annotations.id, id)))
      .returning({ id: annotations.id });

    if (rows.length === 0) throw new AnnotationNotFoundException();
  }
}
