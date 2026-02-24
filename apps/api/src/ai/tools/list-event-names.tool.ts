import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EventsService } from '../../events/events.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const tool = defineTool({
  name: 'list_event_names',
  description: 'List all tracked event names in the project. Use this to discover available events before querying.',
  schema: z.object({}),
});

@Injectable()
export class ListEventNamesTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly eventsService: EventsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (_args, userId, projectId) => {
    const names = await this.eventsService.getEventNames(projectId);
    return { event_names: names };
  });
}
