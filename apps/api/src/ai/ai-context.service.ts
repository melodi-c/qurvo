import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../providers/redis.provider';
import { EventsService } from '../events/events.service';
import { PersonsService } from '../persons/persons.service';

const CONTEXT_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class AiContextService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly eventsService: EventsService,
    private readonly personsService: PersonsService,
  ) {}

  async getProjectContext(userId: string, projectId: string): Promise<string> {
    const cacheKey = `ai_context:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const [eventNames, propertyNames] = await Promise.all([
      this.eventsService.getEventNames(userId, projectId),
      this.personsService.getPersonPropertyNames(userId, projectId),
    ]);

    const context = [
      '## Available Data',
      '',
      `### Event Names (${eventNames.length})`,
      eventNames.length > 0 ? eventNames.map((n) => `- ${n}`).join('\n') : '- No events tracked yet',
      '',
      `### Person Properties (${propertyNames.length})`,
      propertyNames.length > 0 ? propertyNames.map((n) => `- ${n}`).join('\n') : '- No person properties found',
    ].join('\n');

    await this.redis.set(cacheKey, context, 'EX', CONTEXT_CACHE_TTL);
    return context;
  }
}
