import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

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

// ---------------------------------------------------------------------------
// Minimal Zod → JSON Schema converter (handles only types our tools use)
// ---------------------------------------------------------------------------

function zodTypeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const desc = schema.description;
  const base = (obj: Record<string, unknown>) => (desc ? { ...obj, description: desc } : obj);

  if (schema instanceof z.ZodString) return base({ type: 'string' });
  if (schema instanceof z.ZodNumber) return base({ type: 'number' });
  if (schema instanceof z.ZodBoolean) return base({ type: 'boolean' });

  if (schema instanceof z.ZodEnum) {
    return base({ type: 'string', enum: schema.options });
  }

  if (schema instanceof z.ZodOptional) {
    const inner = zodTypeToJsonSchema(schema.unwrap());
    return desc ? { ...inner, description: desc } : inner;
  }

  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = { type: 'array', items: zodTypeToJsonSchema(schema.element) };
    if (schema._def.minLength !== null) result.minItems = schema._def.minLength.value;
    if (schema._def.maxLength !== null) result.maxItems = schema._def.maxLength.value;
    return base(result);
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(val as z.ZodTypeAny);
      if (!(val instanceof z.ZodOptional)) required.push(key);
    }
    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    return base(result);
  }

  return base({});
}

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
      parameters: zodTypeToJsonSchema(schema),
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
