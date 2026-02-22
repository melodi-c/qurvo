import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EventsService } from '../../events/events.service';
import { AiDataTool } from './ai-tool.interface';

const argsSchema = z.object({});

@Injectable()
export class ListEventNamesTool extends AiDataTool<typeof argsSchema> {
  readonly name = 'list_event_names';
  readonly description = 'List all tracked event names in the project. Use this to discover available events before querying.';
  readonly argsSchema = argsSchema;

  constructor(private readonly eventsService: EventsService) {
    super();
  }

  protected async execute(_args: z.infer<typeof argsSchema>, userId: string, projectId: string) {
    const names = await this.eventsService.getEventNames(userId, projectId);
    return { event_names: names };
  }
}
