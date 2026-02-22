import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface ToolCallResult {
  result: unknown;
  visualization_type: string | null;
}

export interface AiTool {
  readonly name: string;
  definition(): ChatCompletionTool;
  execute(args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult>;
}

export const AI_TOOLS = Symbol('AI_TOOLS');
