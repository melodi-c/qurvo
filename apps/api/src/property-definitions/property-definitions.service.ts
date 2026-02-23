import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, asc, ilike, count, SQL } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { propertyDefinitions, eventProperties, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { PropertyDefinitionNotFoundException } from './exceptions/property-definition-not-found.exception';
import { InsufficientPermissionsException } from '../projects/exceptions/insufficient-permissions.exception';

export interface PropertyDefinitionItem {
  property_name: string;
  property_type: 'event' | 'person';
  value_type: string | null;
  is_numerical: boolean;
  id: string;
  description: string | null;
  tags: string[];
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
}

export interface ListParams {
  type?: 'event' | 'person';
  eventName?: string;
  search?: string;
  is_numerical?: boolean;
  limit: number;
  offset: number;
  order_by: string;
  order: 'asc' | 'desc';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columnMap: Record<string, any> = {
  last_seen_at: propertyDefinitions.last_seen_at,
  property_name: propertyDefinitions.property_name,
  created_at: propertyDefinitions.created_at,
  updated_at: propertyDefinitions.updated_at,
};

@Injectable()
export class PropertyDefinitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string, params: ListParams): Promise<{ items: PropertyDefinitionItem[]; total: number }> {
    await this.projectsService.getMembership(userId, projectId);

    if (params.eventName) {
      return this.listEventScoped(projectId, params);
    }

    return this.listGlobal(projectId, params);
  }

  private async listGlobal(projectId: string, params: ListParams): Promise<{ items: PropertyDefinitionItem[]; total: number }> {
    const conditions: SQL[] = [eq(propertyDefinitions.project_id, projectId)];
    if (params.type) conditions.push(eq(propertyDefinitions.property_type, params.type));
    if (params.search) conditions.push(ilike(propertyDefinitions.property_name, `%${params.search}%`));
    if (params.is_numerical !== undefined) conditions.push(eq(propertyDefinitions.is_numerical, params.is_numerical));

    const where = and(...conditions)!;
    const orderCol = columnMap[params.order_by] ?? propertyDefinitions.last_seen_at;
    const orderFn = params.order === 'asc' ? asc : desc;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(propertyDefinitions)
        .where(where)
        .orderBy(orderFn(orderCol))
        .limit(params.limit)
        .offset(params.offset),
      this.db
        .select({ count: count() })
        .from(propertyDefinitions)
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        property_name: r.property_name,
        property_type: r.property_type as 'event' | 'person',
        value_type: r.value_type,
        is_numerical: r.is_numerical,
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

  private async listEventScoped(projectId: string, params: ListParams): Promise<{ items: PropertyDefinitionItem[]; total: number }> {
    const epConditions: SQL[] = [
      eq(eventProperties.project_id, projectId),
      eq(eventProperties.event_name, params.eventName!),
    ];
    if (params.type) epConditions.push(eq(eventProperties.property_type, params.type));
    if (params.search) epConditions.push(ilike(eventProperties.property_name, `%${params.search}%`));

    const epWhere = and(...epConditions)!;

    const [epRows, epCountResult] = await Promise.all([
      this.db
        .select({
          property_name: eventProperties.property_name,
          property_type: eventProperties.property_type,
          ep_last_seen_at: eventProperties.last_seen_at,
        })
        .from(eventProperties)
        .where(epWhere)
        .orderBy(desc(eventProperties.last_seen_at))
        .limit(params.limit)
        .offset(params.offset),
      this.db
        .select({ count: count() })
        .from(eventProperties)
        .where(epWhere),
    ]);

    if (epRows.length === 0) return { items: [], total: epCountResult[0].count };

    // Get metadata from property_definitions
    const pdConditions: SQL[] = [eq(propertyDefinitions.project_id, projectId)];
    if (params.type) pdConditions.push(eq(propertyDefinitions.property_type, params.type));
    const pdRows = await this.db
      .select()
      .from(propertyDefinitions)
      .where(and(...pdConditions));

    const metaMap = new Map(
      pdRows.map((r) => [`${r.property_name}:${r.property_type}`, r]),
    );

    return {
      items: epRows.map((ep) => {
        const meta = metaMap.get(`${ep.property_name}:${ep.property_type}`);
        return {
          property_name: ep.property_name,
          property_type: ep.property_type as 'event' | 'person',
          value_type: meta?.value_type ?? null,
          is_numerical: meta?.is_numerical ?? false,
          id: meta?.id ?? '',
          description: meta?.description ?? null,
          tags: meta?.tags ?? [],
          verified: meta?.verified ?? false,
          last_seen_at: ep.ep_last_seen_at.toISOString(),
          updated_at: meta?.updated_at?.toISOString() ?? '',
        };
      }),
      total: epCountResult[0].count,
    };
  }

  async upsert(
    userId: string,
    projectId: string,
    propertyName: string,
    propertyType: 'event' | 'person',
    input: { description?: string; tags?: string[]; verified?: boolean; value_type?: string; is_numerical?: boolean },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: propertyName,
        property_type: propertyType,
        description: input.description ?? null,
        tags: input.tags ?? [],
        verified: input.verified ?? false,
        value_type: input.value_type ?? null,
        is_numerical: input.is_numerical ?? false,
      })
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
        set: {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.verified !== undefined ? { verified: input.verified } : {}),
          ...(input.value_type !== undefined ? { value_type: input.value_type } : {}),
          ...(input.is_numerical !== undefined ? { is_numerical: input.is_numerical } : {}),
          updated_at: new Date(),
        },
      })
      .returning();

    return rows[0];
  }

  async delete(userId: string, projectId: string, propertyName: string, propertyType: 'event' | 'person') {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();

    const existing = await this.db
      .select({ id: propertyDefinitions.id })
      .from(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, propertyName),
        eq(propertyDefinitions.property_type, propertyType),
      ));

    if (existing.length === 0) throw new PropertyDefinitionNotFoundException(propertyName);

    await this.db
      .delete(propertyDefinitions)
      .where(and(
        eq(propertyDefinitions.project_id, projectId),
        eq(propertyDefinitions.property_name, propertyName),
        eq(propertyDefinitions.property_type, propertyType),
      ));

    return { ok: true };
  }
}
