import { z } from 'zod';
import { zodFunction } from 'openai/helpers/zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export type ToolCallResult = { result: unknown; visualization_type?: string };

export const AI_TOOLS = Symbol('AI_TOOLS');

/** Shared filter schema reused by trend & funnel tools */
export const propertyFilterSchema = z.object({
  property: z.string().describe(
    'Property to filter on. Use "properties.<key>" for event properties (e.g. "properties.promocode"), ' +
    'or direct columns: url, referrer, page_title, page_path, device_type, browser, os, country, region, city',
  ),
  operator: z.enum(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set']).describe('Filter operator'),
  value: z.string().optional().describe('Value to compare against (not needed for is_set/is_not_set)'),
});

/** Common interface consumed by AiService */
export interface AiTool {
  readonly name: string;
  readonly cacheable?: boolean;
  definition(): ChatCompletionTool;
  run(rawArgs: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult>;
}

/**
 * Creates cached tool definition + run method builder.
 * Centralises zodFunction call, Zod parse, and ToolCallResult wrapping.
 */
export function defineTool<T extends z.ZodType>(config: {
  name: string;
  description: string;
  schema: T;
  visualizationType?: string;
}) {
  const def = zodFunction({
    name: config.name,
    parameters: config.schema,
    description: config.description,
  });

  return {
    name: config.name,
    definition: def as ChatCompletionTool,
    createRun(
      execute: (args: z.infer<T>, userId: string, projectId: string) => Promise<unknown>,
    ): AiTool['run'] {
      return async (rawArgs, userId, projectId) => {
        const args = config.schema.parse(rawArgs);
        const result = await execute(args, userId, projectId);
        return config.visualizationType
          ? { result, visualization_type: config.visualizationType }
          : { result };
      };
    },
  };
}
