import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { PersonsService } from '../persons/persons.service';
import { AI_CONTEXT_MAX_EVENT_NAMES, AI_CONTEXT_MAX_PROPERTY_NAMES } from '../constants';

@Injectable()
export class AiContextService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly personsService: PersonsService,
  ) {}

  async getProjectContext(projectId: string): Promise<string> {
    const [allEventNames, allPropertyNames] = await Promise.all([
      this.eventsService.getEventNames(projectId),
      this.personsService.getPersonPropertyNames(projectId),
    ]);

    const eventNames = allEventNames.slice(0, AI_CONTEXT_MAX_EVENT_NAMES);
    const eventNamesOverflow = allEventNames.length - eventNames.length;

    const propertyNames = allPropertyNames.slice(0, AI_CONTEXT_MAX_PROPERTY_NAMES);
    const propertyNamesOverflow = allPropertyNames.length - propertyNames.length;

    return [
      '## Available Data',
      '',
      `### Event Names (${allEventNames.length})`,
      eventNames.length > 0 ? eventNames.map((n) => `- ${n}`).join('\n') : '- No events tracked yet',
      ...(eventNamesOverflow > 0 ? [`- (+ ${eventNamesOverflow} more)`] : []),
      '',
      `### Person Properties (${allPropertyNames.length})`,
      propertyNames.length > 0 ? propertyNames.map((n) => `- ${n}`).join('\n') : '- No person properties found',
      ...(propertyNamesOverflow > 0 ? [`- (+ ${propertyNamesOverflow} more)`] : []),
    ].join('\n');
  }
}
