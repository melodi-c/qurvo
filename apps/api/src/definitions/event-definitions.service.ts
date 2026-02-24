import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, asc, ilike, and, count, SQL } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { eventDefinitions, eventProperties, type Database } from '@qurvo/db';
import { DefinitionNotFoundException } from './exceptions/definition-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

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
  limit: number;
  offset: number;
  order_by: string;
  order: 'asc' | 'desc';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columnMap: Record<string, any> = {
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

  async list(userId: string, projectId: string, params: EventDefinitionListParams): Promise<{ items: EventDefinitionItem[]; total: number }> {
    const conditions: SQL[] = [eq(eventDefinitions.project_id, projectId)];
    if (params.search) {
      conditions.push(ilike(eventDefinitions.event_name, `%${params.search}%`));
    }

    const where = and(...conditions)!;
    const orderCol = columnMap[params.order_by] ?? eventDefinitions.last_seen_at;
    const orderFn = params.order === 'asc' ? asc : desc;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(eventDefinitions)
        .where(where)
        .orderBy(orderFn(orderCol))
        .limit(params.limit)
        .offset(params.offset),
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
    userId: string,
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

  async delete(userId: string, projectId: string, eventName: string) {
    const existing = await this.db
      .select({ id: eventDefinitions.id })
      .from(eventDefinitions)
      .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, eventName)));

    if (existing.length === 0) throw new DefinitionNotFoundException('event', eventName);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(eventProperties)
        .where(and(eq(eventProperties.project_id, projectId), eq(eventProperties.event_name, eventName)));
      await tx
        .delete(eventDefinitions)
        .where(and(eq(eventDefinitions.project_id, projectId), eq(eventDefinitions.event_name, eventName)));
    });

    return { ok: true };
  }
}
