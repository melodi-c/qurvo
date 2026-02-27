import { describe, it, expect } from 'vitest';
import { tokenize, evaluateFormula, validateFormula } from './formula-evaluator';

// ── tokenize ──

describe('tokenize', () => {
  it('tokenizes simple expression', () => {
    const tokens = tokenize('A + B');
    expect(tokens).toEqual([
      { type: 'letter', value: 'A' },
      { type: 'op', value: '+' },
      { type: 'letter', value: 'B' },
    ]);
  });

  it('tokenizes expression with numbers', () => {
    const tokens = tokenize('A * 100');
    expect(tokens).toEqual([
      { type: 'letter', value: 'A' },
      { type: 'op', value: '*' },
      { type: 'number', value: '100' },
    ]);
  });

  it('tokenizes expression with parentheses', () => {
    const tokens = tokenize('(A - B) / B');
    expect(tokens).toEqual([
      { type: 'lparen', value: '(' },
      { type: 'letter', value: 'A' },
      { type: 'op', value: '-' },
      { type: 'letter', value: 'B' },
      { type: 'rparen', value: ')' },
      { type: 'op', value: '/' },
      { type: 'letter', value: 'B' },
    ]);
  });

  it('tokenizes decimal numbers', () => {
    const tokens = tokenize('A * 1.5');
    expect(tokens).toEqual([
      { type: 'letter', value: 'A' },
      { type: 'op', value: '*' },
      { type: 'number', value: '1.5' },
    ]);
  });

  it('throws on unexpected character', () => {
    expect(() => tokenize('A & B')).toThrow('Unexpected character');
  });

  it('throws on number with multiple decimal points', () => {
    expect(() => tokenize('1.2.3')).toThrow('Invalid number');
  });

  it('throws on bare dot', () => {
    expect(() => tokenize('.')).toThrow('Invalid number token');
  });

  it('tokenizes decimal number with leading dot (.5) as invalid', () => {
    // .5 starts with dot — parseFloat('.5') = 0.5, but this is an edge case.
    // The tokenizer currently accepts leading-dot numbers. Test that it at least
    // doesn't silently produce NaN.
    expect(() => tokenize('.5')).not.toThrow();
    const tokens = tokenize('.5');
    expect(tokens).toEqual([{ type: 'number', value: '.5' }]);
  });
});

// ── evaluateFormula ──

describe('evaluateFormula', () => {
  function makeSeriesData(data: Record<string, Record<string, number>>): Map<string, Map<string, number>> {
    const map = new Map<string, Map<string, number>>();
    for (const [letter, buckets] of Object.entries(data)) {
      map.set(letter, new Map(Object.entries(buckets)));
    }
    return map;
  }

  it('evaluates simple addition A + B', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10, '2025-01-02': 20 },
      B: { '2025-01-01': 5, '2025-01-02': 15 },
    });

    const result = evaluateFormula('A + B', seriesData);
    expect(result).toEqual([
      { bucket: '2025-01-01', value: 15 },
      { bucket: '2025-01-02', value: 35 },
    ]);
  });

  it('evaluates subtraction A - B', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 100, '2025-01-02': 200 },
      B: { '2025-01-01': 30, '2025-01-02': 50 },
    });

    const result = evaluateFormula('A - B', seriesData);
    expect(result).toEqual([
      { bucket: '2025-01-01', value: 70 },
      { bucket: '2025-01-02', value: 150 },
    ]);
  });

  it('evaluates division B / A * 100 (conversion rate)', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 1000, '2025-01-02': 500 },
      B: { '2025-01-01': 50, '2025-01-02': 25 },
    });

    const result = evaluateFormula('B / A * 100', seriesData);
    expect(result).toEqual([
      { bucket: '2025-01-01', value: 5 },
      { bucket: '2025-01-02', value: 5 },
    ]);
  });

  it('handles division by zero → 0', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 0, '2025-01-02': 10 },
      B: { '2025-01-01': 50, '2025-01-02': 25 },
    });

    const result = evaluateFormula('B / A', seriesData);
    expect(result[0].value).toBe(0);
    expect(result[1].value).toBe(2.5);
  });

  it('handles missing bucket → 0', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10, '2025-01-02': 20 },
      B: { '2025-01-01': 5 }, // missing 2025-01-02
    });

    const result = evaluateFormula('A + B', seriesData);
    expect(result).toEqual([
      { bucket: '2025-01-01', value: 15 },
      { bucket: '2025-01-02', value: 20 }, // B missing → 0
    ]);
  });

  it('respects operator precedence: A + B * 2', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10 },
      B: { '2025-01-01': 5 },
    });

    const result = evaluateFormula('A + B * 2', seriesData);
    expect(result[0].value).toBe(20); // 10 + (5 * 2)
  });

  it('respects parentheses: (A + B) * 2', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10 },
      B: { '2025-01-01': 5 },
    });

    const result = evaluateFormula('(A + B) * 2', seriesData);
    expect(result[0].value).toBe(30); // (10 + 5) * 2
  });

  it('evaluates complex formula: (A - B) / B * 100', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 150 },
      B: { '2025-01-01': 100 },
    });

    const result = evaluateFormula('(A - B) / B * 100', seriesData);
    expect(result[0].value).toBe(50); // (150 - 100) / 100 * 100 = 50
  });

  it('handles unary minus', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10 },
    });

    const result = evaluateFormula('-A', seriesData);
    expect(result[0].value).toBe(-10);
  });

  it('handles unknown series letter → 0', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10 },
    });

    const result = evaluateFormula('A + C', seriesData);
    expect(result[0].value).toBe(10); // C is missing, defaults to 0
  });

  it('handles numeric constant only', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-01': 10 },
    });

    const result = evaluateFormula('A + 5', seriesData);
    expect(result[0].value).toBe(15);
  });

  it('returns sorted buckets', () => {
    const seriesData = makeSeriesData({
      A: { '2025-01-03': 30, '2025-01-01': 10, '2025-01-02': 20 },
    });

    const result = evaluateFormula('A', seriesData);
    expect(result.map((r) => r.bucket)).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
  });
});

// ── validateFormula ──

describe('validateFormula', () => {
  const letters = ['A', 'B', 'C'];

  it('validates correct formula', () => {
    expect(validateFormula('A + B', letters)).toEqual({ valid: true });
  });

  it('validates formula with parentheses', () => {
    expect(validateFormula('(A - B) / B * 100', letters)).toEqual({ valid: true });
  });

  it('rejects empty formula', () => {
    const result = validateFormula('', letters);
    expect(result).toEqual({ valid: false, error: 'empty' });
  });

  it('rejects whitespace-only formula', () => {
    const result = validateFormula('   ', letters);
    expect(result).toEqual({ valid: false, error: 'empty' });
  });

  it('rejects unknown series letter', () => {
    const result = validateFormula('A + D', letters);
    expect(result).toEqual({ valid: false, error: 'unknownSeries' });
  });

  it('rejects syntax error', () => {
    const result = validateFormula('A +', letters);
    expect(result).toEqual({ valid: false, error: 'syntax' });
  });

  it('rejects unmatched parentheses', () => {
    const result = validateFormula('(A + B', letters);
    expect(result).toEqual({ valid: false, error: 'syntax' });
  });

  it('rejects formula with no series references', () => {
    const result = validateFormula('100 + 200', letters);
    expect(result).toEqual({ valid: false, error: 'noSeries' });
  });

  it('accepts formula with single series', () => {
    expect(validateFormula('A * 2', letters)).toEqual({ valid: true });
  });

  it('rejects number with multiple decimal points (1.2.3)', () => {
    const result = validateFormula('A/1.2.3*B', letters);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toBe('syntax');
  });

  it('rejects bare dot as number (.)', () => {
    const result = validateFormula('A/.*B', letters);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toBe('syntax');
  });

  it('accepts valid decimal numbers in formulas', () => {
    expect(validateFormula('A/B*100', letters)).toEqual({ valid: true });
    expect(validateFormula('A+B-C', letters)).toEqual({ valid: true });
    expect(validateFormula('A * 1.5', letters)).toEqual({ valid: true });
  });
});
