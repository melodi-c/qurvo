import { describe, it, expect } from 'vitest';
import { isoNumericToAlpha2 } from './iso-numeric-to-alpha2';

describe('isoNumericToAlpha2', () => {
  it('returns US for numeric code 840', () => {
    expect(isoNumericToAlpha2('840')).toBe('US');
  });

  it('returns DE for numeric code 276', () => {
    expect(isoNumericToAlpha2('276')).toBe('DE');
  });

  it('returns empty string for unknown code 999', () => {
    expect(isoNumericToAlpha2('999')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(isoNumericToAlpha2('')).toBe('');
  });

  it('handles un-padded numeric codes (world-atlas emits these without leading zeros)', () => {
    // "4" should resolve the same as "004" (Afghanistan)
    expect(isoNumericToAlpha2('4')).toBe('AF');
    // "36" should resolve the same as "036" (Australia)
    expect(isoNumericToAlpha2('36')).toBe('AU');
  });

  it('returns correct alpha-2 for a sample of common countries', () => {
    expect(isoNumericToAlpha2('250')).toBe('FR'); // France
    expect(isoNumericToAlpha2('156')).toBe('CN'); // China
    expect(isoNumericToAlpha2('356')).toBe('IN'); // India
    expect(isoNumericToAlpha2('076')).toBe('BR'); // Brazil
    expect(isoNumericToAlpha2('124')).toBe('CA'); // Canada
    expect(isoNumericToAlpha2('826')).toBe('GB'); // United Kingdom
    expect(isoNumericToAlpha2('392')).toBe('JP'); // Japan
    expect(isoNumericToAlpha2('643')).toBe('RU'); // Russia
  });
});
