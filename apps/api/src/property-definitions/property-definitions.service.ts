import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { propertyDefinitions, eventProperties, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';

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

@Injectable()
export class PropertyDefinitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string, type?: 'event' | 'person', eventName?: string): Promise<PropertyDefinitionItem[]> {
    await this.projectsService.getMembership(userId, projectId);

    if (eventName) {
      // Event-scoped: get property names from event_properties, join with property_definitions for metadata
      const epRows = await this.db
        .select({
          property_name: eventProperties.property_name,
          property_type: eventProperties.property_type,
          ep_last_seen_at: eventProperties.last_seen_at,
        })
        .from(eventProperties)
        .where(and(
          eq(eventProperties.project_id, projectId),
          eq(eventProperties.event_name, eventName),
          ...(type ? [eq(eventProperties.property_type, type)] : []),
        ));

      if (epRows.length === 0) return [];

      // Get metadata from property_definitions
      const conditions = [eq(propertyDefinitions.project_id, projectId)];
      if (type) conditions.push(eq(propertyDefinitions.property_type, type));
      const pdRows = await this.db
        .select()
        .from(propertyDefinitions)
        .where(and(...conditions));

      const metaMap = new Map(
        pdRows.map((r) => [`${r.property_name}:${r.property_type}`, r]),
      );

      return epRows.map((ep) => {
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
      });
    }

    // Global: read directly from property_definitions
    const conditions = [eq(propertyDefinitions.project_id, projectId)];
    if (type) conditions.push(eq(propertyDefinitions.property_type, type));

    const rows = await this.db
      .select()
      .from(propertyDefinitions)
      .where(and(...conditions))
      .orderBy(desc(propertyDefinitions.last_seen_at));

    return rows.map((r) => ({
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
    }));
  }

  async upsert(
    userId: string,
    projectId: string,
    propertyName: string,
    propertyType: 'event' | 'person',
    input: { description?: string; tags?: string[]; verified?: boolean },
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
      })
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
        set: {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.verified !== undefined ? { verified: input.verified } : {}),
          updated_at: new Date(),
        },
      })
      .returning();

    return rows[0];
  }
}
