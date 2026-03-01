import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../ai/tools/ai-tool.interface';

/**
 * End-to-end test: zodFunction() + normalizeJsonSchema() pipeline.
 * Verifies that discriminatedUnion schemas produce tool definitions
 * without $ref — required for DeepSeek Reasoner compatibility.
 */
describe('defineTool $ref normalization', () => {
  function collectRefs(node: unknown, refs: string[] = []): string[] {
    if (!node || typeof node !== 'object') {return refs;}
    if (Array.isArray(node)) {
      for (const item of node) {collectRefs(item, refs);}
      return refs;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj['$ref'] === 'string') {refs.push(obj['$ref']);}
    for (const val of Object.values(obj)) {collectRefs(val, refs);}
    return refs;
  }

  it('inlines $ref in discriminatedUnion schema', () => {
    const schema = z.object({
      items: z.array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('alpha'), value: z.string() }),
          z.object({ type: z.literal('beta'), count: z.number() }),
        ]),
      ),
    });

    const tool = defineTool({
      name: 'test_tool',
      description: 'Test tool',
      schema,
    });

    const params = tool.definition.function.parameters as Record<string, unknown>;

    // No $ref anywhere in the parameters
    const refs = collectRefs(params);
    expect(refs).toEqual([]);

    // No definitions section
    expect(params).not.toHaveProperty('definitions');
    expect(params).not.toHaveProperty('$defs');
  });

  it('produces valid anyOf branches with type field', () => {
    const schema = z.object({
      condition: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('a'), x: z.string() }),
        z.object({ kind: z.literal('b'), y: z.number() }),
      ]),
    });

    const tool = defineTool({
      name: 'anyof_tool',
      description: 'Tool with anyOf',
      schema,
    });

    const params = tool.definition.function.parameters as Record<string, unknown>;
    const props = params.properties as Record<string, Record<string, unknown>>;
    const conditionSchema = props.condition;

    // The condition property should have anyOf with full schemas (not $ref)
    if (conditionSchema.anyOf) {
      const anyOf = conditionSchema.anyOf as Array<Record<string, unknown>>;
      for (const branch of anyOf) {
        expect(branch).toHaveProperty('type', 'object');
        expect(branch).not.toHaveProperty('$ref');
      }
    }
  });

  it('handles nested discriminatedUnion (like create-cohort)', () => {
    // Simulates the real create-cohort pattern: discriminatedUnion inside an array
    // inside another discriminatedUnion
    const leafA = z.object({ type: z.literal('leaf_a'), val: z.string() });
    const leafB = z.object({ type: z.literal('leaf_b'), num: z.number() });
    const innerGroup = z.object({
      type: z.literal('group'),
      values: z.array(z.discriminatedUnion('type', [leafA, leafB])),
    });

    const schema = z.object({
      definition: z.object({
        type: z.enum(['AND', 'OR']),
        values: z.array(
          z.discriminatedUnion('type', [leafA, leafB, innerGroup]),
        ),
      }),
    });

    const tool = defineTool({
      name: 'nested_tool',
      description: 'Tool with nested unions',
      schema,
    });

    const params = tool.definition.function.parameters as Record<string, unknown>;
    const refs = collectRefs(params);
    expect(refs).toEqual([]);
    expect(params).not.toHaveProperty('definitions');
  });

  it('cleans up .nullish() artifacts in nested discriminatedUnion (Zod v4 compat)', () => {
    // Zod v4 compat (3.25.x) serialises .nullish() fields in $ref definitions as
    // { "anyOf": [{"not":{}}, {self-$ref}] } — the self-ref collapses to {} after
    // normalisation, leaving anyOf branches without "type". Strict-schema providers
    // (DeepSeek) reject these.
    const leafA = z.object({ type: z.literal('leaf_a'), val: z.string().nullish() });
    const leafB = z.object({ type: z.literal('leaf_b'), num: z.number() });
    const innerGroup = z.object({
      type: z.literal('group'),
      values: z.array(z.discriminatedUnion('type', [leafA, leafB])),
    });

    const schema = z.object({
      definition: z.object({
        type: z.enum(['AND', 'OR']),
        values: z.array(
          z.discriminatedUnion('type', [leafA, leafB, innerGroup]),
        ),
      }),
    });

    const tool = defineTool({
      name: 'nullish_tool',
      description: 'Tool with nullish in nested union',
      schema,
    });

    const params = tool.definition.function.parameters as Record<string, unknown>;

    // No $ref or definitions after normalization
    const refs = collectRefs(params);
    expect(refs).toEqual([]);
    expect(params).not.toHaveProperty('definitions');
    expect(params).not.toHaveProperty('$defs');

    // Recursively verify: no anyOf branch should be {"not":{}} or {}
    function collectBrokenAnyOf(node: unknown, broken: unknown[] = []): unknown[] {
      if (!node || typeof node !== 'object') {return broken;}
      if (Array.isArray(node)) {
        for (const item of node) {collectBrokenAnyOf(item, broken);}
        return broken;
      }
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.anyOf)) {
        for (const branch of obj.anyOf as unknown[]) {
          if (
            branch &&
            typeof branch === 'object' &&
            !Array.isArray(branch)
          ) {
            const keys = Object.keys(branch as Record<string, unknown>);
            const b = branch as Record<string, unknown>;
            // {"not":{}} artifact
            if (keys.length === 1 && keys[0] === 'not' && typeof b.not === 'object' && Object.keys(b.not as Record<string, unknown>).length === 0) {
              broken.push(branch);
            }
            // {} empty object artifact
            if (keys.length === 0) {
              broken.push(branch);
            }
          }
        }
      }
      for (const val of Object.values(obj)) {collectBrokenAnyOf(val, broken);}
      return broken;
    }

    const brokenBranches = collectBrokenAnyOf(params);
    expect(brokenBranches).toEqual([]);

    // Verify the val field is resolved to a proper type (not wrapped in broken anyOf)
    // Navigate to: definition.values[items].anyOf[leaf_a].val
    const defProp = (params.properties as Record<string, Record<string, unknown>>).definition;
    const defProps = defProp.properties as Record<string, Record<string, unknown>>;
    const valuesItems = (defProps.values).items as Record<string, unknown>;
    const anyOfBranches = valuesItems.anyOf as Array<Record<string, unknown>>;

    // Find the leaf_a branch
    const leafABranch = anyOfBranches.find((b) => {
      const props = b.properties as Record<string, Record<string, unknown>> | undefined;
      return props?.type?.const === 'leaf_a';
    });
    expect(leafABranch).toBeDefined();

    // The val field should NOT have anyOf with broken branches
    const valField = (leafABranch!.properties as Record<string, Record<string, unknown>>).val;
    expect(valField).not.toHaveProperty('anyOf');
  });
});
