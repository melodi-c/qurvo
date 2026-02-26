import { describe, it, expect } from 'vitest';
import { buildConditionalUpdate } from '../../utils/build-conditional-update';

describe('buildConditionalUpdate', () => {
  it('returns empty object when no fields are listed', () => {
    const result = buildConditionalUpdate({ name: 'Alice', age: 30 }, []);
    expect(result).toEqual({});
  });

  it('returns empty object when all listed fields are undefined', () => {
    const input = { name: undefined, age: undefined };
    const result = buildConditionalUpdate(input, ['name', 'age']);
    expect(result).toEqual({});
  });

  it('includes all fields that are defined', () => {
    const input = { name: 'Alice', age: 30 };
    const result = buildConditionalUpdate(input, ['name', 'age']);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('excludes undefined fields and includes defined ones', () => {
    const input: { name?: string; age?: number; email?: string } = { name: 'Bob', age: undefined, email: 'bob@example.com' };
    const result = buildConditionalUpdate(input, ['name', 'age', 'email']);
    expect(result).toEqual({ name: 'Bob', email: 'bob@example.com' });
    expect(result).not.toHaveProperty('age');
  });

  it('only processes fields listed in the fields array, ignores unlisted', () => {
    const input = { name: 'Carol', age: 25, hidden: 'secret' };
    const result = buildConditionalUpdate(input, ['name', 'age']);
    expect(result).toEqual({ name: 'Carol', age: 25 });
    expect(result).not.toHaveProperty('hidden');
  });

  it('treats null as a defined value (not undefined)', () => {
    const input: { name: string | null } = { name: null };
    const result = buildConditionalUpdate(input, ['name']);
    expect(result).toEqual({ name: null });
  });

  it('treats false as a defined value', () => {
    const input: { active: boolean | undefined } = { active: false };
    const result = buildConditionalUpdate(input, ['active']);
    expect(result).toEqual({ active: false });
  });

  it('treats 0 as a defined value', () => {
    const input: { count: number | undefined } = { count: 0 };
    const result = buildConditionalUpdate(input, ['count']);
    expect(result).toEqual({ count: 0 });
  });

  it('treats empty string as a defined value', () => {
    const input: { bio: string | undefined } = { bio: '' };
    const result = buildConditionalUpdate(input, ['bio']);
    expect(result).toEqual({ bio: '' });
  });

  it('only includes a subset of fields when only some are listed', () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = buildConditionalUpdate(input, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: 3 });
  });
});
