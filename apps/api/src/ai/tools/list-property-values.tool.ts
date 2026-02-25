import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EventsService } from '../../events/events.service';
import { PersonsService } from '../../persons/persons.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  property_name: z.string().describe(
    'The property to look up. Use "properties.<key>" for custom event properties (e.g. "properties.browser"), ' +
    'or a direct column name for built-in event columns (e.g. "browser", "country", "device_type"). ' +
    'For person properties, use the property key name directly (e.g. "plan", "company").',
  ),
  property_type: z.enum(['event', 'person']).describe(
    'Whether this is an event property (from events table) or a person property (from person profiles)',
  ),
  event_name: z.string().optional().describe(
    'Optional: scope event property values to a specific event name. Only applies when property_type is "event".',
  ),
  limit: z.number().int().min(1).max(200).optional().describe(
    'Maximum number of distinct values to return, sorted by occurrence count descending. Default: 50.',
  ),
});

const tool = defineTool({
  name: 'list_property_values',
  description:
    'List distinct values for a given event or person property, sorted by occurrence count. ' +
    'Use this to discover what values exist for a property before filtering — e.g. to find out what browsers, ' +
    'countries, or custom property values are present in the data.',
  schema: argsSchema,
});

@Injectable()
export class ListPropertyValuesTool implements AiTool {
  readonly name = tool.name;

  constructor(
    private readonly eventsService: EventsService,
    private readonly personsService: PersonsService,
  ) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const limit = args.limit ?? 50;

    if (args.property_type === 'event') {
      const values = await this.eventsService.getEventPropertyValues(
        projectId,
        args.property_name,
        args.event_name,
        limit,
      );
      return { property_name: args.property_name, property_type: 'event', values };
    } else {
      const values = await this.personsService.getPersonPropertyValues(
        projectId,
        args.property_name,
        limit,
      );
      return { property_name: args.property_name, property_type: 'person', values };
    }
  });
}
