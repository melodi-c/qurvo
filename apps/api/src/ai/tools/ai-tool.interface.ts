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
  value: z.string().nullish().describe('Value to compare against (not needed for is_set/is_not_set)'),
});

/** Common interface consumed by AiService */
export interface AiTool {
  readonly name: string;
  readonly cacheable?: boolean;
  definition(): ChatCompletionTool;
  run(rawArgs: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult>;
}

/**
 * Recursively inlines all `$ref` pointers in a JSON Schema object and removes
 * the `definitions` / `$defs` section. This is required because DeepSeek
 * Reasoner rejects tool schemas where `anyOf` branches contain `$ref` elements
 * without a top-level `type` field.
 *
 * `zodFunction()` from the openai SDK produces `$ref` entries when serialising
 * `z.discriminatedUnion()` — this normalisation step resolves them in-place so
 * every branch carries its own full schema.
 */
export function normalizeJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const defs = (schema.definitions || schema['$defs'] || {}) as Record<
    string,
    unknown
  >;

  function resolveRef(ref: string): unknown {
    return defs[ref.replace('#/definitions/', '').replace('#/$defs/', '')];
  }

  const resolving = new Set<string>();

  function walk(node: unknown): unknown {
    if (!node || typeof node !== 'object') {return node;}
    if (Array.isArray(node)) {return node.map(walk);}

    const obj = node as Record<string, unknown>;

    if (obj['$ref']) {
      const refKey = obj['$ref'] as string;
      const resolved = resolveRef(refKey);
      if (!resolved) {return node;}

      // Cycle detected — inline a copy without further $ref expansion
      if (resolving.has(refKey)) {
        return stripRefs(JSON.parse(JSON.stringify(resolved)));
      }

      resolving.add(refKey);
      const result = walk(JSON.parse(JSON.stringify(resolved)));
      resolving.delete(refKey);
      return result;
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'definitions' || key === '$defs') {continue;}
      result[key] = walk(val);
    }
    return result;
  }

  /** Remove all $ref pointers from a deep-copied node (break cycles). */
  function stripRefs(node: unknown): unknown {
    if (!node || typeof node !== 'object') {return node;}
    if (Array.isArray(node)) {return node.map(stripRefs);}

    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === '$ref' || key === 'definitions' || key === '$defs') {continue;}
      result[key] = stripRefs(val);
    }
    return result;
  }

  return walk(schema) as Record<string, unknown>;
}

/**
 * Recursively strips `null` from every property in a type, replacing it with
 * `undefined`. This aligns `.nullish()` Zod output (`T | null | undefined`)
 * with downstream service types that expect `T | undefined`.
 */
type StripNulls<T> =
  T extends null ? undefined :
  T extends (infer U)[] ? StripNulls<U>[] :
  T extends object ? { [K in keyof T]: StripNulls<T[K]> } :
  T;

/**
 * Recursively converts `null` values to `undefined` in a plain object.
 * OpenAI Structured Outputs requires `.nullish()` (= `.optional().nullable()`)
 * on optional Zod fields, but downstream service types expect `T | undefined`,
 * not `T | null`. This bridge normalises the parsed result.
 */
export function stripNulls<T>(obj: T): StripNulls<T> {
  if (obj === null) {return undefined as StripNulls<T>;}
  if (Array.isArray(obj)) {return obj.map(stripNulls) as StripNulls<T>;}
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = stripNulls(val);
    }
    return result as StripNulls<T>;
  }
  return obj as StripNulls<T>;
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
  const raw = zodFunction({
    name: config.name,
    parameters: config.schema,
    description: config.description,
  });

  // Normalize the function parameters to inline $ref pointers — required for
  // DeepSeek Reasoner compatibility (rejects anyOf branches without "type").
  const def: ChatCompletionTool = {
    ...raw,
    function: {
      ...raw.function,
      parameters: raw.function.parameters
        ? normalizeJsonSchema(
            raw.function.parameters as Record<string, unknown>,
          )
        : raw.function.parameters,
    },
  };

  return {
    name: config.name,
    definition: def,
    createRun(
      execute: (args: StripNulls<z.infer<T>>, userId: string, projectId: string) => Promise<unknown>,
    ): AiTool['run'] {
      return async (rawArgs, userId, projectId) => {
        const args = stripNulls(config.schema.parse(rawArgs));
        const result = await execute(args, userId, projectId);
        return config.visualizationType
          ? { result, visualization_type: config.visualizationType }
          : { result };
      };
    },
  };
}
