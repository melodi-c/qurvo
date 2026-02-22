import { Injectable, Inject } from '@nestjs/common';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { Database } from '@qurvo/db';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import {
  queryPersons,
  queryPersonById,
  queryPersonsCount,
  type PersonsQueryParams,
  type PersonRow,
} from './persons.query';
import { queryPersonEvents, type PersonEventsQueryParams, type PersonEventRow } from './person-events.query';
import { queryPersonPropertyNames } from './person-property-names.query';
import { PersonNotFoundException } from './exceptions/person-not-found.exception';

const PROPERTY_NAMES_CACHE_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class PersonsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
  ) {}

  async getPersons(
    userId: string,
    params: PersonsQueryParams,
  ): Promise<{ persons: PersonRow[]; total: number }> {
    await this.projectsService.getMembership(userId, params.project_id);
    const [personsList, total] = await Promise.all([
      queryPersons(this.db, params),
      queryPersonsCount(this.db, { project_id: params.project_id, search: params.search, filters: params.filters }),
    ]);
    return { persons: personsList, total };
  }

  async getPersonById(userId: string, projectId: string, personId: string): Promise<PersonRow> {
    await this.projectsService.getMembership(userId, projectId);
    const person = await queryPersonById(this.db, projectId, personId);
    if (!person) throw new PersonNotFoundException();
    return person;
  }

  async getPersonEvents(
    userId: string,
    params: PersonEventsQueryParams,
  ): Promise<PersonEventRow[]> {
    await this.projectsService.getMembership(userId, params.project_id);
    return queryPersonEvents(this.ch, params);
  }

  async getPersonPropertyNames(userId: string, projectId: string): Promise<string[]> {
    await this.projectsService.getMembership(userId, projectId);
    const cacheKey = `person_property_names:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];
    const names = await queryPersonPropertyNames(this.db, projectId);
    await this.redis.set(cacheKey, JSON.stringify(names), 'EX', PROPERTY_NAMES_CACHE_TTL_SECONDS);
    return names;
  }
}
