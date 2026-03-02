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

  it('resolves self-referencing $ref from .nullish() in discriminatedUnion (#920)', () => {
    // Reproduces the exact pattern from create-insight.tool.ts:
    // propertyFilterSchema with `value: z.string().nullish()` is shared
    // across trendParamsSchema and funnelParamsSchema in a discriminatedUnion.
    // zodFunction() deduplicates the shared sub-schema via $ref, and Zod
    // 3.25.x serialises the .nullish() field as a self-referencing definition:
    //   { "anyOf": [{"not":{}}, {"$ref":"#/definitions/...self"}] }
    // Without the fix, normalizeJsonSchema collapses this to empty `{}`.
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        query_params: {
          anyOf: [
            {
              // Trend branch — inline occurrence of propertyFilterSchema
              type: 'object',
              properties: {
                type: { type: 'string', const: 'trend' },
                filters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      property: { type: 'string' },
                      value: { type: 'string', nullable: true },
                    },
                    required: ['property', 'value'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['type', 'filters'],
              additionalProperties: false,
            },
            {
              // Funnel branch — $ref to shared definitions
              type: 'object',
              properties: {
                type: { type: 'string', const: 'funnel' },
                filters: {
                  type: 'array',
                  items: { $ref: '#/definitions/shared_filter' },
                },
              },
              required: ['type', 'filters'],
              additionalProperties: false,
            },
          ],
        },
      },
      definitions: {
        shared_filter: {
          type: 'object',
          properties: {
            property: { $ref: '#/definitions/shared_filter_property' },
            value: { $ref: '#/definitions/shared_filter_value' },
          },
          required: ['property', 'value'],
          additionalProperties: false,
        },
        shared_filter_property: { type: 'string' },
        // Self-referencing .nullish() definition — the root cause of #920
        shared_filter_value: {
          anyOf: [
            { not: {} },
            { $ref: '#/definitions/shared_filter_value' },
          ],
        },
      },
    };

    const result = normalizeJsonSchema(schema);

    // No $ref or definitions should remain
    expect(result).not.toHaveProperty('definitions');
    const json = JSON.stringify(result);
    expect(json).not.toContain('$ref');
    expect(json).not.toContain('"not"');

    // The funnel branch's filter value should have proper type, not empty {}
    const queryParams = (result.properties as Record<string, unknown>).query_params as Record<string, unknown>;
    const funnelBranch = (queryParams.anyOf as Record<string, unknown>[])[1];
    const filtersItems = ((funnelBranch.properties as Record<string, unknown>).filters as Record<string, unknown>).items as Record<string, unknown>;
    const valueProp = (filtersItems.properties as Record<string, unknown>).value as Record<string, unknown>;

    // Must NOT be empty {} — should have type info from inline occurrence
    expect(Object.keys(valueProp).length).toBeGreaterThan(0);
    expect(valueProp).toHaveProperty('type', 'string');
  });

  it('resolves self-referencing $ref for .nullish() array fields (#920)', () => {
    // Same pattern but with array .nullish() (event_filters case)
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        items: {
          anyOf: [
            {
              // First branch — inline
              type: 'object',
              properties: {
                type: { type: 'string', const: 'a' },
                tags: {
                  anyOf: [
                    { type: 'array', items: { type: 'string' } },
                    { type: 'null' },
                  ],
                },
              },
              required: ['type', 'tags'],
              additionalProperties: false,
            },
            {
              // Second branch — $ref
              type: 'object',
              properties: {
                type: { type: 'string', const: 'b' },
                tags: { $ref: '#/definitions/tags_nullish' },
              },
              required: ['type', 'tags'],
              additionalProperties: false,
            },
          ],
        },
      },
      definitions: {
        tags_nullish: {
          anyOf: [
            { not: {} },
            { $ref: '#/definitions/tags_nullish' },
          ],
        },
      },
    };

    const result = normalizeJsonSchema(schema);

    expect(result).not.toHaveProperty('definitions');
    const json = JSON.stringify(result);
    expect(json).not.toContain('$ref');

    // The second branch's tags should be resolved to the inline type
    const items = (result.properties as Record<string, unknown>).items as Record<string, unknown>;
    const secondBranch = (items.anyOf as Record<string, unknown>[])[1];
    const tags = (secondBranch.properties as Record<string, unknown>).tags as Record<string, unknown>;

    // Should have proper structure, not empty {}
    expect(Object.keys(tags).length).toBeGreaterThan(0);
    // Should match the inline version: { anyOf: [{type:"array",...}, {type:"null"}] }
    expect(tags).toHaveProperty('anyOf');
    const anyOf = tags.anyOf as Record<string, unknown>[];
    expect(anyOf.length).toBe(2);
    expect(anyOf[0]).toHaveProperty('type', 'array');
    expect(anyOf[1]).toHaveProperty('type', 'null');
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

  it('does not mutate the original schema with self-referencing definitions', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        branch1: {
          type: 'object',
          properties: {
            val: { type: 'string', nullable: true },
          },
          required: ['val'],
          additionalProperties: false,
        },
        branch2: {
          type: 'object',
          properties: {
            val: { $ref: '#/definitions/val_nullish' },
          },
          required: ['val'],
          additionalProperties: false,
        },
      },
      definitions: {
        val_nullish: {
          anyOf: [{ not: {} }, { $ref: '#/definitions/val_nullish' }],
        },
      },
    };

    const original = JSON.stringify(schema);
    normalizeJsonSchema(schema);

    expect(JSON.stringify(schema)).toBe(original);
  });
});
