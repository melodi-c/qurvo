import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ToolCallResult =
  | { result: unknown; visualization_type: string }
  | { result: unknown; visualization_type: null };

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

/**
 * Builds a ChatCompletionTool definition from a Zod schema.
 * Standalone function — avoids TS2589 (infinite type instantiation)
 * that occurs when zodToJsonSchema is called inside a generic class method.
 */
function buildToolDefinition(
  name: string,
  description: string,
  schema: z.ZodTypeAny,
): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name,
      description,
      // Library boundary: zodToJsonSchema returns JsonSchema7Type, OpenAI expects Record<string, unknown>
      parameters: (zodToJsonSchema as Function)(schema, { target: 'openApi3' }) as Record<string, unknown>,
    },
  };
}

/** Common interface consumed by AiToolsService */
export interface AiTool {
  readonly name: string;
  definition(): ChatCompletionTool;
  run(rawArgs: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult>;
}

/** Tool that returns data with a visual representation (chart/table) */
export abstract class AiVisualizationTool<T extends z.ZodTypeAny> implements AiTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly argsSchema: T;
  abstract readonly visualizationType: string;

  definition(): ChatCompletionTool {
    return buildToolDefinition(this.name, this.description, this.argsSchema);
  }

  protected abstract execute(args: z.infer<T>, userId: string, projectId: string): Promise<unknown>;

  async run(rawArgs: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const args = this.argsSchema.parse(rawArgs);
    const result = await this.execute(args, userId, projectId);
    return { result, visualization_type: this.visualizationType };
  }
}

/** Tool that returns raw data without visualization */
export abstract class AiDataTool<T extends z.ZodTypeAny> implements AiTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly argsSchema: T;

  definition(): ChatCompletionTool {
    return buildToolDefinition(this.name, this.description, this.argsSchema);
  }

  protected abstract execute(args: z.infer<T>, userId: string, projectId: string): Promise<unknown>;

  async run(rawArgs: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const args = this.argsSchema.parse(rawArgs);
    const result = await this.execute(args, userId, projectId);
    return { result, visualization_type: null };
  }
}
