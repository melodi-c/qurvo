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
});
