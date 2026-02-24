import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { PersonsService } from '../persons/persons.service';

@Injectable()
export class AiContextService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly personsService: PersonsService,
  ) {}

  async getProjectContext(userId: string, projectId: string): Promise<string> {
    const [eventNames, propertyNames] = await Promise.all([
      this.eventsService.getEventNames(userId, projectId),
      this.personsService.getPersonPropertyNames(userId, projectId),
    ]);

    return [
      '## Available Data',
      '',
      `### Event Names (${eventNames.length})`,
      eventNames.length > 0 ? eventNames.map((n) => `- ${n}`).join('\n') : '- No events tracked yet',
      '',
      `### Person Properties (${propertyNames.length})`,
      propertyNames.length > 0 ? propertyNames.map((n) => `- ${n}`).join('\n') : '- No person properties found',
    ].join('\n');
  }
}
