import { Injectable, Inject, Logger } from '@nestjs/common';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@shot/clickhouse';
import { queryEvents, countEvents, queryTrends, queryTopEvents } from './queries';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly projectsService: ProjectsService,
  ) {}

  async getEvents(userId: string, params: { project_id: string; event_name?: string; distinct_id?: string; from?: string; to?: string; limit: number; offset: number }) {
    await this.projectsService.getMembership(userId, params.project_id);
    this.logger.debug({ projectId: params.project_id, query: 'getEvents' }, 'Analytics query');
    return queryEvents(this.ch, params);
  }

  async getCounts(userId: string, params: { project_id: string; event_name?: string; from?: string; to?: string }) {
    await this.projectsService.getMembership(userId, params.project_id);
    this.logger.debug({ projectId: params.project_id, query: 'getCounts' }, 'Analytics query');
    return countEvents(this.ch, params);
  }

  async getTrends(userId: string, params: { project_id: string; event_name?: string; from: string; to: string; granularity: 'hour' | 'day' | 'week' | 'month' }) {
    await this.projectsService.getMembership(userId, params.project_id);
    this.logger.debug({ projectId: params.project_id, query: 'getTrends' }, 'Analytics query');
    return queryTrends(this.ch, params);
  }

  async getTopEvents(userId: string, params: { project_id: string; from?: string; to?: string; limit: number }) {
    await this.projectsService.getMembership(userId, params.project_id);
    this.logger.debug({ projectId: params.project_id, query: 'getTopEvents' }, 'Analytics query');
    return queryTopEvents(this.ch, params);
  }
}
