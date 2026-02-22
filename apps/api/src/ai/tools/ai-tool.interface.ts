import { z, type ZodType } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ToolCallResult {
  result: unknown;
  visualization_type: string | null;
}

export const AI_TOOLS = Symbol('AI_TOOLS');

// Shared filter schema reused by trend & funnel tools
export const propertyFilterSchema = z.object({
  property: z.string().describe(
    'Property to filter on. Use "properties.<key>" for event properties (e.g. "properties.promocode"), ' +
    'or direct columns: url, referrer, page_title, page_path, device_type, browser, os, country, region, city',
  ),
  operator: z.enum(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set']).describe('Filter operator'),
  value: z.string().optional().describe('Value to compare against (not needed for is_set/is_not_set)'),
});

/**
 * Base class for AI tools. Zod schema is the single source of truth:
 * - TypeScript args type is inferred via z.infer
 * - JSON Schema for OpenAI is generated via zodToJsonSchema
 * - visualization_type is declared once on the class
 */
export abstract class BaseAiTool<T extends ZodType = ZodType> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly argsSchema: T;
  abstract readonly visualizationType: string | null;

  definition(): ChatCompletionTool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (zodToJsonSchema as any)(this.argsSchema, { target: 'openApi3' });
    delete (schema as Record<string, unknown>)['$schema'];
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: schema as Record<string, unknown>,
      },
    };
  }

  protected abstract execute(args: z.infer<T>, userId: string, projectId: string): Promise<unknown>;

  async run(rawArgs: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const args = this.argsSchema.parse(rawArgs);
    const result = await this.execute(args, userId, projectId);
    return { result, visualization_type: this.visualizationType };
  }
}
