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
