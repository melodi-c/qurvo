import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { EventsService } from '../../events/events.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class ListEventNamesTool implements AiTool {
  readonly name = 'list_event_names';

  constructor(private readonly eventsService: EventsService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: 'List all tracked event names in the project. Use this to discover available events before querying.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    };
  }

  async execute(_args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const names = await this.eventsService.getEventNames(userId, projectId);
    return { result: { event_names: names }, visualization_type: null };
  }
}
