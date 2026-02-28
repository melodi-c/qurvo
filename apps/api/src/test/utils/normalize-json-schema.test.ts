import { describe, it, expect } from 'vitest';
import { normalizeJsonSchema } from '../../ai/tools/ai-tool.interface';

describe('normalizeJsonSchema', () => {
  it('inlines $ref pointers from definitions', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        items: {
          anyOf: [
            { $ref: '#/definitions/Foo' },
            { $ref: '#/definitions/Bar' },
          ],
        },
      },
      definitions: {
        Foo: { type: 'object', properties: { kind: { type: 'string', const: 'foo' } } },
        Bar: { type: 'object', properties: { kind: { type: 'string', const: 'bar' } } },
      },
    };

    const result = normalizeJsonSchema(schema);

    // $ref should be resolved
    expect(result).not.toHaveProperty('definitions');
    const items = (result.properties as Record<string, unknown>).items as Record<string, unknown>;
    const anyOf = items.anyOf as Array<Record<string, unknown>>;
    expect(anyOf).toHaveLength(2);
    expect(anyOf[0]).toHaveProperty('type', 'object');
    expect(anyOf[1]).toHaveProperty('type', 'object');
    expect(anyOf[0]).not.toHaveProperty('$ref');
    expect(anyOf[1]).not.toHaveProperty('$ref');
  });

  it('inlines nested $ref pointers', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        outer: { $ref: '#/definitions/Outer' },
      },
      definitions: {
        Inner: { type: 'string', const: 'inner_value' },
        Outer: {
          type: 'object',
          properties: { nested: { $ref: '#/definitions/Inner' } },
        },
      },
    };

    const result = normalizeJsonSchema(schema);

    expect(result).not.toHaveProperty('definitions');
    const outer = (result.properties as Record<string, unknown>).outer as Record<string, unknown>;
    expect(outer.type).toBe('object');
    const nested = (outer.properties as Record<string, unknown>).nested as Record<string, unknown>;
    expect(nested.type).toBe('string');
    expect(nested.const).toBe('inner_value');
  });

  it('handles $defs variant', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        field: { $ref: '#/$defs/MyType' },
      },
      $defs: {
        MyType: { type: 'number' },
      },
    };

    const result = normalizeJsonSchema(schema);

    expect(result).not.toHaveProperty('$defs');
    const field = (result.properties as Record<string, unknown>).field as Record<string, unknown>;
    expect(field.type).toBe('number');
  });

  it('passes through schemas without $ref unchanged', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };

    const result = normalizeJsonSchema(schema);

    expect(result).toEqual(schema);
  });

  it('preserves unresolvable $ref as-is', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        ext: { $ref: '#/definitions/Unknown' },
      },
      definitions: {},
    };

    const result = normalizeJsonSchema(schema);

    const ext = (result.properties as Record<string, unknown>).ext as Record<string, unknown>;
    expect(ext).toHaveProperty('$ref', '#/definitions/Unknown');
  });

  it('handles recursive $ref without infinite loop (self-referencing)', () => {
    // TreeNode references itself: children is an array of TreeNode
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        root: { $ref: '#/definitions/TreeNode' },
      },
      definitions: {
        TreeNode: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/definitions/TreeNode' },
            },
          },
        },
      },
    };

    // Must not throw RangeError: Maximum call stack size exceeded
    const result = normalizeJsonSchema(schema);

    expect(result).not.toHaveProperty('definitions');
    const root = (result.properties as Record<string, unknown>).root as Record<string, unknown>;
    expect(root.type).toBe('object');
    // First level children should be inlined
    const children = (root.properties as Record<string, unknown>).children as Record<string, unknown>;
    expect(children.type).toBe('array');
    // The recursive $ref should be stripped (no more $ref in the output)
    const nestedItems = children.items as Record<string, unknown>;
    expect(nestedItems).not.toHaveProperty('$ref');
    expect(nestedItems.type).toBe('object');
  });

  it('handles mutually recursive $ref without infinite loop', () => {
    // A references B, B references A
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        start: { $ref: '#/definitions/A' },
      },
      definitions: {
        A: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            next: { $ref: '#/definitions/B' },
          },
        },
        B: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            back: { $ref: '#/definitions/A' },
          },
        },
      },
    };

    const result = normalizeJsonSchema(schema);

    expect(result).not.toHaveProperty('definitions');
    const start = (result.properties as Record<string, unknown>).start as Record<string, unknown>;
    expect(start.type).toBe('object');
    // A.next should be resolved to B
    const next = (start.properties as Record<string, unknown>).next as Record<string, unknown>;
    expect(next.type).toBe('object');
    expect((next.properties as Record<string, unknown>)).toHaveProperty('value');
    // B.back should be resolved but without further $ref (cycle broken)
    const back = (next.properties as Record<string, unknown>).back as Record<string, unknown>;
    expect(back).not.toHaveProperty('$ref');
    expect(back.type).toBe('object');
  });

  it('handles cohort-like pattern: discriminatedUnion with shared $ref across branches', () => {
    // Simulates the pattern from create-cohort.tool.ts where multiple
    // anyOf branches share the same $ref definitions
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        definition: {
          type: 'object',
          properties: {
            values: {
              type: 'array',
              items: {
                anyOf: [
                  { $ref: '#/$defs/LeafA' },
                  { $ref: '#/$defs/LeafB' },
                  { $ref: '#/$defs/InnerGroup' },
                ],
              },
            },
          },
        },
      },
      $defs: {
        LeafA: { type: 'object', properties: { type: { const: 'a' }, v: { type: 'string' } } },
        LeafB: { type: 'object', properties: { type: { const: 'b' }, n: { type: 'number' } } },
        InnerGroup: {
          type: 'object',
          properties: {
            type: { const: 'group' },
            values: {
              type: 'array',
              items: {
                anyOf: [
                  { $ref: '#/$defs/LeafA' },
                  { $ref: '#/$defs/LeafB' },
                ],
              },
            },
          },
        },
      },
    };

    const result = normalizeJsonSchema(schema);

    expect(result).not.toHaveProperty('$defs');
    // Verify no $ref remains anywhere in the output
    const json = JSON.stringify(result);
    expect(json).not.toContain('$ref');
  });

  it('does not mutate the original schema', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: { f: { $ref: '#/definitions/X' } },
      definitions: { X: { type: 'boolean' } },
    };

    const original = JSON.stringify(schema);
    normalizeJsonSchema(schema);

    expect(JSON.stringify(schema)).toBe(original);
  });
});
