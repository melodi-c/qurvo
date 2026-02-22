import { Inject, Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool, ToolCallResult } from './tools/ai-tool.interface';

export type { ToolCallResult } from './tools/ai-tool.interface';

@Injectable()
export class AiToolsService {
  private readonly toolMap: Map<string, AiTool>;

  constructor(@Inject(AI_TOOLS) tools: AiTool[]) {
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
  }

  getToolDefinitions(): ChatCompletionTool[] {
    return [...this.toolMap.values()].map((t) => t.definition());
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    userId: string,
    projectId: string,
  ): Promise<ToolCallResult> {
    const tool = this.toolMap.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args, userId, projectId);
  }
}
