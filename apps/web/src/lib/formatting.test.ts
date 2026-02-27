/**
 * Unit tests for formatBucket — timezone-aware bucket date formatting.
 *
 * Key scenarios:
 * - Buckets from ClickHouse come as "YYYY-MM-DD HH:MM:SS" (UTC, space-separated) or "YYYY-MM-DD"
 * - Without timezone (or UTC) the date should display correctly using UTC
 * - With a non-UTC timezone (e.g. Europe/Moscow, UTC+3) dates shift accordingly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatBucket } from './formatting';

// Mock the language store so getLocale() returns 'en' consistently
vi.mock('@/stores/language', () => ({
  useLanguageStore: {
    getState: () => ({ language: 'en' }),
  },
}));

// Mock the pluralize module (used by formatGranularity, not formatBucket)
vi.mock('@/i18n/pluralize', () => ({
  pluralize: (count: number, forms: { one: string; few: string; many: string }) => {
    if (count === 1) return `${count} ${forms.one}`;
    return `${count} ${forms.many}`;
  },
}));

describe('formatBucket — UTC normalisation', () => {
  it('handles "YYYY-MM-DD HH:MM:SS" space-separated bucket (day granularity)', () => {
    // "2026-02-27 00:00:00" in UTC → day display
    const result = formatBucket('2026-02-27 00:00:00', 'day', false, 'UTC');
    // Should show Feb 27 (UTC)
    expect(result).toContain('27');
    expect(result).toMatch(/feb/i);
  });

  it('handles "YYYY-MM-DD" date-only bucket (day granularity)', () => {
    const result = formatBucket('2026-02-27', 'day', false, 'UTC');
    expect(result).toContain('27');
    expect(result).toMatch(/feb/i);
  });

  it('returns empty string for empty bucket', () => {
    expect(formatBucket('', 'day')).toBe('');
  });
});

describe('formatBucket — timezone shifting', () => {
  it('UTC timezone shows same day as input (2026-02-27)', () => {
    const result = formatBucket('2026-02-27 00:00:00', 'day', false, 'UTC');
    expect(result).toMatch(/27/);
  });

  it('Europe/Moscow (UTC+3) does NOT shift day boundary for midnight UTC', () => {
    // 2026-02-27 00:00:00 UTC = 2026-02-27 03:00:00 MSK → still Feb 27 in MSK
    const result = formatBucket('2026-02-27 00:00:00', 'day', false, 'Europe/Moscow');
    expect(result).toMatch(/27/);
    expect(result).toMatch(/feb/i);
  });

  it('Europe/Moscow (UTC+3) shows correct day for 23:00 UTC (= next day MSK)', () => {
    // 2026-02-27 23:00:00 UTC = 2026-02-28 02:00:00 MSK → Feb 28 in MSK
    const result = formatBucket('2026-02-27 23:00:00', 'hour', false, 'Europe/Moscow');
    // In MSK this is 02:00 on Feb 28
    expect(result).toMatch(/28/);
  });

  it('UTC matches no-timezone (default UTC) for month granularity', () => {
    const withUTC = formatBucket('2026-02-01 00:00:00', 'month', false, 'UTC');
    const withoutTz = formatBucket('2026-02-01 00:00:00', 'month');
    expect(withUTC).toBe(withoutTz);
  });

  it('compact mode still respects timezone for day granularity', () => {
    // Feb 27 in MSK
    const result = formatBucket('2026-02-27 00:00:00', 'day', true, 'Europe/Moscow');
    expect(result).toMatch(/27/);
  });
});

describe('formatBucket — granularity labels', () => {
  it('month granularity shows short month and year', () => {
    const result = formatBucket('2026-01-01 00:00:00', 'month', false, 'UTC');
    expect(result).toMatch(/jan/i);
    expect(result).toMatch(/26/);
  });

  it('week granularity starts with W', () => {
    const result = formatBucket('2026-02-16 00:00:00', 'week', false, 'UTC');
    expect(result).toMatch(/^W\d+/);
  });
});
