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
 *
 * Additionally cleans up Zod v4 compat (3.25.x) artifacts: `.nullish()` fields
 * serialised through `$ref` produce `{ "anyOf": [{"not":{}}, {self-$ref}] }`.
 * After $ref resolution the self-ref collapses to `{}`, leaving `anyOf` branches
 * without `type`. The `cleanAnyOf` post-pass strips these artifacts so every
 * branch carries a valid `type`.
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

  /**
   * Post-pass: clean up broken `anyOf` branches produced by Zod v4 compat
   * `.nullish()` serialisation. Removes:
   * - `{"not":{}}` — Zod v4 artifact representing undefined/void
   * - `{}` — result of stripped self-referencing `$ref`
   * If one branch remains after cleanup, unwrap it. If zero remain, return `{}`.
   *
   * Order: recurse FIRST, then filter artifacts. This ensures nested broken
   * branches (produced by `stripRefs()` on self-referencing `$ref`) are cleaned
   * even when they appear inside already-cleaned parent branches.
   */
  function cleanAnyOf(node: unknown): unknown {
    if (!node || typeof node !== 'object') {return node;}
    if (Array.isArray(node)) {return node.map(cleanAnyOf);}

    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (key === 'anyOf' && Array.isArray(val)) {
        // 1. Recurse into each branch first
        const recursed = val.map(cleanAnyOf);
        // 2. Filter artifacts AFTER recursion (nested artifacts are now exposed)
        const cleaned = recursed
          .filter((branch) => !isEmptyObject(branch) && !isNotEmpty(branch));

        if (cleaned.length === 0) {
          // All branches were artifacts — replace with permissive `{}`
          Object.assign(result, {});
        } else if (cleaned.length === 1) {
          // Single remaining branch — unwrap anyOf
          const single = cleaned[0] as Record<string, unknown>;
          Object.assign(result, single);
        } else {
          result[key] = cleaned;
        }
      } else {
        result[key] = cleanAnyOf(val);
      }
    }

    return result;
  }

  /** Check if a value is `{}` (empty object — no own keys). */
  function isEmptyObject(val: unknown): boolean {
    return (
      !!val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      Object.keys(val as Record<string, unknown>).length === 0
    );
  }

  /** Check if a value is `{"not":{}}` — Zod v4 artifact for undefined/void. */
  function isNotEmpty(val: unknown): boolean {
    if (!val || typeof val !== 'object' || Array.isArray(val)) {return false;}
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj);
    return keys.length === 1 && keys[0] === 'not' && isEmptyObject(obj.not);
  }

  const resolved = walk(schema) as Record<string, unknown>;
  return cleanAnyOf(resolved) as Record<string, unknown>;
}

/** Allowed `format` values per DeepSeek specification. */
const DEEPSEEK_ALLOWED_FORMATS = new Set([
  'email', 'hostname', 'ipv4', 'ipv6', 'uuid',
]);

/**
 * Runtime assertion that a normalised tool JSON Schema is compatible with
 * DeepSeek Reasoner's strict subset of JSON Schema.
 *
 * Checks (recursively):
 * - Every `anyOf` branch has a `type` field
 * - No `{"not": ...}` anywhere
 * - No `{}` (empty objects) inside `anyOf`
 * - No `$ref` (all must be resolved by `normalizeJsonSchema`)
 * - No unsupported `format` values (only email, hostname, ipv4, ipv6, uuid)
 * - `additionalProperties` if present must be boolean `false`, not an object
 *
 * Throws an Error with tool name and JSON-path if validation fails.
 */
export function assertDeepSeekCompatible(
  schema: Record<string, unknown>,
  toolName: string,
): void {
  const errors: string[] = [];

  function walk(node: unknown, path: string): void {
    if (!node || typeof node !== 'object') {return;}
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${path}[${i}]`);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    // No $ref allowed
    if ('$ref' in obj) {
      errors.push(`${path}.$ref: unresolved $ref "${obj['$ref']}"`);
    }

    // No "not" allowed
    if ('not' in obj) {
      errors.push(`${path}.not: "not" keyword is not supported by DeepSeek`);
    }

    // additionalProperties must be boolean false, not an object schema
    if ('additionalProperties' in obj && typeof obj.additionalProperties !== 'boolean') {
      errors.push(
        `${path}.additionalProperties: must be boolean false, got ${typeof obj.additionalProperties}`,
      );
    }

    // format must be in the allowed set
    if ('format' in obj && typeof obj.format === 'string') {
      if (!DEEPSEEK_ALLOWED_FORMATS.has(obj.format)) {
        errors.push(
          `${path}.format: unsupported format "${obj.format}" (allowed: ${[...DEEPSEEK_ALLOWED_FORMATS].join(', ')})`,
        );
      }
    }

    // anyOf branch validation
    if ('anyOf' in obj && Array.isArray(obj.anyOf)) {
      for (let i = 0; i < obj.anyOf.length; i++) {
        const branch = obj.anyOf[i];
        const branchPath = `${path}.anyOf[${i}]`;

        if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
          errors.push(`${branchPath}: branch is not an object`);
          continue;
        }

        const b = branch as Record<string, unknown>;
        const keys = Object.keys(b);

        // Empty object
        if (keys.length === 0) {
          errors.push(`${branchPath}: empty object {} in anyOf`);
          continue;
        }

        // {"not":{}} artifact
        if (keys.length === 1 && keys[0] === 'not') {
          errors.push(`${branchPath}: {"not":...} artifact in anyOf`);
          continue;
        }

        // Must have "type"
        if (!('type' in b)) {
          errors.push(`${branchPath}: anyOf branch missing "type" field`);
        }
      }
    }

    // Recurse into all values
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'anyOf' && Array.isArray(val)) {
        // Already checked branches above, but recurse into each
        for (let i = 0; i < val.length; i++) {
          walk(val[i], `${path}.anyOf[${i}]`);
        }
      } else {
        walk(val, `${path}.${key}`);
      }
    }
  }

  walk(schema, '$');

  if (errors.length > 0) {
    throw new Error(
      `Tool "${toolName}" has DeepSeek-incompatible JSON Schema:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
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
  const normalizedParams = raw.function.parameters
    ? normalizeJsonSchema(raw.function.parameters as Record<string, unknown>)
    : raw.function.parameters;

  // Runtime assertion: catch DeepSeek-incompatible schemas at app startup, not
  // at first chat request. This prevents the recurring "missing field `type`"
  // regressions (issues #492, #592, #689, #836).
  if (normalizedParams) {
    assertDeepSeekCompatible(normalizedParams as Record<string, unknown>, config.name);
  }

  const def: ChatCompletionTool = {
    ...raw,
    function: {
      ...raw.function,
      parameters: normalizedParams,
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
