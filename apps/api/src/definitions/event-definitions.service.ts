import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, asc, ilike, and, count, SQL, type AnyColumn } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { eventDefinitions, eventProperties, type Database } from '@qurvo/db';
import { DefinitionNotFoundException } from './exceptions/definition-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';
import { escapeLikePattern } from '../utils/escape-like';

export interface EventDefinitionItem {
  event_name: string;
  id: string;
  description: string | null;
  tags: string[];
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
}

export interface EventDefinitionListParams {
  search?: string;
  limit?: number;
  offset?: number;
  order_by?: 'last_seen_at' | 'event_name' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}

const columnMap: Record<string, AnyColumn> = {
  last_seen_at: eventDefinitions.last_seen_at,
  event_name: eventDefinitions.event_name,
  created_at: eventDefinitions.created_at,
  updated_at: eventDefinitions.updated_at,
};

@Injectable()
export class EventDefinitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async list(projectId: string, params: EventDefinitionListParams): Promise<{ items: EventDefinitionItem[]; total: number }> {
    const conditions: SQL[] = [eq(eventDefinitions.project_id, projectId)];
    if (params.search) {
      conditions.push(ilike(eventDefinitions.event_name, `%${escapeLikePattern(params.search)}%`));
    }

    // and() always returns a value when given at least one condition (project_id is always present)
    const where = and(...conditions) ?? eq(eventDefinitions.project_id, projectId);
    const orderCol = columnMap[params.order_by ?? 'last_seen_at'] ?? eventDefinitions.last_seen_at;
    const orderFn = params.order === 'asc' ? asc : desc;
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(eventDefinitions)
        .where(where)
        .orderBy(orderFn(orderCol))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(eventDefinitions)
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        event_name: r.event_name,
        id: r.id,
        description: r.description ?? null,
        tags: r.tags,
        verified: r.verified,
        last_seen_at: r.last_seen_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      })),
      total: countResult[0].count,
    };
  }

  async upsert(
    projectId: string,
    eventName: string,
    input: { description?: string; tags?: string[]; verified?: boolean },
  ) {
    const rows = await this.db
      .insert(eventDefinitions)
      .values({
        project_id: projectId,
        event_name: eventName,
        description: input.description ?? null,
        tags: input.tags ?? [],
        verified: input.verified ?? false,
      })
      .onConflictDoUpdate({
        target: [eventDefinitions.project_id, eventDefinitions.event_name],
        set: {
          ...buildConditionalUpdate(input, ['description', 'tags', 'verified']),
          updated_at: new Date(),
        },
      })
      .returning();

    return rows[0];
  }

  async delete(projectId: string, eventName: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(eventProperties)
        .where(and(eq(eventProperties.project_id, projectId), eq(eventProperties.event_name, eventName)));
      const deleted = await tx
        .delete(eventDefinitions)
        .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, eventName)))
        .returning({ id: eventDefinitions.id });
      if (deleted.length === 0) {throw new DefinitionNotFoundException('event', eventName);}
    });
  }
}
