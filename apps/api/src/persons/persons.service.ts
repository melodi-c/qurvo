import { Injectable, Inject } from '@nestjs/common';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { ClickHouseClient } from '@shot/clickhouse';
import type { Database } from '@shot/db';
import { ProjectsService } from '../projects/projects.service';
import {
  queryPersons,
  queryPersonById,
  queryPersonsCount,
  type PersonsQueryParams,
  type PersonRow,
} from './persons.query';
import { queryPersonEvents, type PersonEventsQueryParams, type PersonEventRow } from './person-events.query';
import { PersonNotFoundException } from './exceptions/person-not-found.exception';

@Injectable()
export class PersonsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly projectsService: ProjectsService,
  ) {}

  async getPersons(
    userId: string,
    params: PersonsQueryParams,
  ): Promise<{ persons: PersonRow[]; total: number }> {
    await this.projectsService.getMembership(userId, params.project_id);
    const [personsList, total] = await Promise.all([
      queryPersons(this.db, params),
      queryPersonsCount(this.db, { project_id: params.project_id, search: params.search }),
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
}
