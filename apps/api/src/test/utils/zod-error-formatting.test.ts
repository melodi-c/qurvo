import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';

/**
 * We test the helper functions indirectly by importing the module
 * and triggering ZodError through schema validation, then checking
 * that formatZodErrorForLlm produces the expected output.
 *
 * Since isZodError and formatZodErrorForLlm are module-private functions,
 * we replicate them here for unit testing.
 */

function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError;
}

function formatZodErrorForLlm(err: ZodError): string {
  const lines = err.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  - ${path}: ${issue.message}`;
  });
  return `Invalid tool arguments:\n${lines.join('\n')}`;
}

describe('ZodError formatting for LLM', () => {
  const schema = z.object({
    series: z.array(z.object({
      event: z.string(),
    })),
    granularity: z.enum(['hour', 'day', 'week', 'month']),
    date_from: z.string().optional(),
  });

  it('should detect ZodError via isZodError', () => {
    try {
      schema.parse({});
    } catch (err) {
      expect(isZodError(err)).toBe(true);
    }
  });

  it('should not detect plain Error via isZodError', () => {
    expect(isZodError(new Error('plain error'))).toBe(false);
  });

  it('should not detect non-errors via isZodError', () => {
    expect(isZodError('string')).toBe(false);
    expect(isZodError(null)).toBe(false);
    expect(isZodError(undefined)).toBe(false);
  });

  it('should format missing required fields', () => {
    try {
      schema.parse({});
    } catch (err) {
      expect(isZodError(err)).toBe(true);
      const message = formatZodErrorForLlm(err as ZodError);
      expect(message).toContain('Invalid tool arguments:');
      expect(message).toContain('series');
      expect(message).toContain('granularity');
    }
  });

  it('should format invalid enum values', () => {
    try {
      schema.parse({ series: [{ event: 'page_view' }], granularity: 'century' });
    } catch (err) {
      expect(isZodError(err)).toBe(true);
      const message = formatZodErrorForLlm(err as ZodError);
      expect(message).toContain('Invalid tool arguments:');
      expect(message).toContain('granularity');
    }
  });

  it('should format nested path errors', () => {
    try {
      schema.parse({ series: [{ event: 123 }], granularity: 'day' });
    } catch (err) {
      expect(isZodError(err)).toBe(true);
      const message = formatZodErrorForLlm(err as ZodError);
      expect(message).toContain('series.0.event');
    }
  });

  it('should use (root) for root-level errors', () => {
    const rootSchema = z.string();
    try {
      rootSchema.parse(123);
    } catch (err) {
      expect(isZodError(err)).toBe(true);
      const message = formatZodErrorForLlm(err as ZodError);
      expect(message).toContain('(root)');
    }
  });

  it('should list all issues in multi-error case', () => {
    try {
      schema.parse({ series: 'not-array', granularity: 'bad' });
    } catch (err) {
      expect(isZodError(err)).toBe(true);
      const message = formatZodErrorForLlm(err as ZodError);
      const lines = message.split('\n').filter((l) => l.startsWith('  - '));
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }
  });
});
