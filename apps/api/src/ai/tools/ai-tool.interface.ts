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
  // Deep-copy definitions to avoid mutating the original schema (the
  // pre-pass below may replace self-referencing definitions in-place).
  const defs = JSON.parse(
    JSON.stringify(schema.definitions || schema['$defs'] || {}),
  ) as Record<string, unknown>;

  function resolveRef(ref: string): unknown {
    return defs[ref.replace('#/definitions/', '').replace('#/$defs/', '')];
  }

  // Pre-pass: fix self-referencing `.nullish()` definitions in-place.
  // Zod 3.25.x serialises `.nullish()` for shared schemas as:
  //   { "anyOf": [{"not":{}}, {"$ref":"#/definitions/SELF"}] }
  // This is a degenerate self-reference that carries no type information.
  // The actual type is available in the first inline occurrence of the
  // same property elsewhere in the schema tree. We find it and replace
  // the self-referencing definition with the inline version so `walk()`
  // can resolve it without collapsing to empty `{}`.
  for (const [defKey, defVal] of Object.entries(defs)) {
    if (!defVal || typeof defVal !== 'object') {continue;}
    const d = defVal as Record<string, unknown>;
    if (!Array.isArray(d.anyOf)) {continue;}
    const branches = d.anyOf as unknown[];

    // Check: every branch is either {"not":{}} or {"$ref":"#/.../SELF"}
    const isSelfRefNullish = branches.length >= 2 && branches.every((b) => {
      if (!b || typeof b !== 'object' || Array.isArray(b)) {return false;}
      const obj = b as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 1 && keys[0] === 'not') {return true;}
      if (keys.length === 1 && keys[0] === '$ref') {
        const ref = obj['$ref'] as string;
        const refName = ref.replace('#/definitions/', '').replace('#/$defs/', '');
        return refName === defKey;
      }
      return false;
    });
    if (!isSelfRefNullish) {continue;}

    // Find the inline type from the schema tree: locate a parent object
    // definition that references this defKey via $ref in one of its
    // properties, then find the first inline occurrence of that same
    // parent structure in the schema body.
    const targetRefs = [`#/definitions/${defKey}`, `#/$defs/${defKey}`];
    const inlineType = findInlineForSelfRef(schema, targetRefs, defs);
    if (inlineType) {
      // Replace the self-referencing definition with the inline version
      defs[defKey] = inlineType;
    }
  }

  /**
   * Find the inline version of a self-referencing definition by searching
   * for objects that have `propName: { $ref: targetRef }` in one occurrence
   * and `propName: { <inline> }` in another. Returns the inline version.
   *
   * Searches both definitions and the schema body.
   */
  function findInlineForSelfRef(
    root: Record<string, unknown>,
    targetRefs: string[],
    definitions: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    // Collect all objects with properties that reference targetRefs.
    // Then find a sibling object with the same property set that has
    // the property inlined (not via $ref).
    type ParentInfo = { propNames: string[]; propName: string };
    const parentInfos: ParentInfo[] = [];

    // Search both definitions and schema body for objects referencing target
    function collectParents(node: unknown): void {
      if (!node || typeof node !== 'object') {return;}
      if (Array.isArray(node)) {
        for (const item of node) {collectParents(item);}
        return;
      }
      const obj = node as Record<string, unknown>;
      if (obj.properties && typeof obj.properties === 'object') {
        const props = obj.properties as Record<string, unknown>;
        for (const [pn, pv] of Object.entries(props)) {
          if (!pv || typeof pv !== 'object' || Array.isArray(pv)) {continue;}
          const p = pv as Record<string, unknown>;
          if (targetRefs.includes(p['$ref'] as string)) {
            parentInfos.push({
              propNames: Object.keys(props),
              propName: pn,
            });
            return; // One match per object is enough
          }
        }
      }
      for (const val of Object.values(obj)) {
        collectParents(val);
      }
    }

    // Collect from definitions
    for (const dv of Object.values(definitions)) {
      collectParents(dv);
    }
    // Collect from schema body (excluding definitions)
    for (const [key, val] of Object.entries(root)) {
      if (key === 'definitions' || key === '$defs') {continue;}
      collectParents(val);
    }

    if (parentInfos.length === 0) {return undefined;}

    // Search schema body for an inline occurrence matching any parent
    function searchInline(node: unknown): Record<string, unknown> | undefined {
      if (!node || typeof node !== 'object') {return undefined;}
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = searchInline(item);
          if (found) {return found;}
        }
        return undefined;
      }
      const obj = node as Record<string, unknown>;
      if (obj.properties && typeof obj.properties === 'object') {
        const props = obj.properties as Record<string, unknown>;
        const keys = Object.keys(props);
        for (const info of parentInfos) {
          if (
            keys.length === info.propNames.length &&
            info.propNames.every((k) => k in props)
          ) {
            const targetProp = props[info.propName];
            if (
              targetProp &&
              typeof targetProp === 'object' &&
              !Array.isArray(targetProp) &&
              !(targetProp as Record<string, unknown>)['$ref']
            ) {
              return targetProp as Record<string, unknown>;
            }
          }
        }
      }
      // Recurse (skip definitions — we search body only)
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'definitions' || key === '$defs') {continue;}
        const found = searchInline(val);
        if (found) {return found;}
      }
      return undefined;
    }

    return searchInline(root);
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
        const def = resolved as Record<string, unknown>;
        if (def.type) {
          const minimal: Record<string, unknown> = { type: def.type };
          if (def.description) {minimal.description = def.description;}
          return minimal;
        }
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
          // All branches were artifacts. Try to recover a type from the
          // recursed branches before falling back to empty `{}`.
          const recovered = recursed.find(
            (b) =>
              !!b &&
              typeof b === 'object' &&
              !Array.isArray(b) &&
              'type' in (b as Record<string, unknown>),
          ) as Record<string, unknown> | undefined;
          if (recovered) {
            Object.assign(result, { type: recovered.type });
          }
          // else: result stays as-is (no type info available) — will be
          // caught by assertDeepSeekCompatible
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

    // Property schema validation: every property must have at least one
    // structural keyword. A bare `{}` means normalizeJsonSchema collapsed
    // a self-referencing $ref without recovering the type.
    if ('properties' in obj && obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>;
      for (const [propName, propSchema] of Object.entries(props)) {
        if (
          propSchema &&
          typeof propSchema === 'object' &&
          !Array.isArray(propSchema)
        ) {
          const ps = propSchema as Record<string, unknown>;
          const hasStructure =
            'type' in ps ||
            'anyOf' in ps ||
            'allOf' in ps ||
            'oneOf' in ps ||
            '$ref' in ps ||
            'enum' in ps ||
            'const' in ps;
          if (!hasStructure) {
            errors.push(
              `${path}.properties.${propName}: empty schema {} — missing type/anyOf/enum/const`,
            );
          }
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
    assertDeepSeekCompatible(normalizedParams, config.name);
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
