import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRelativeDate,
  resolveRelativeDate,
  getActivePreset,
  todayIso,
  daysAgoIso,
  defaultDateRange,
  DATE_PRESETS,
  ANCHOR_PRESETS,
} from './date-utils';

describe('isRelativeDate', () => {
  it('returns true for day-based relative strings', () => {
    expect(isRelativeDate('-7d')).toBe(true);
    expect(isRelativeDate('-30d')).toBe(true);
    expect(isRelativeDate('-90d')).toBe(true);
    expect(isRelativeDate('-180d')).toBe(true);
  });

  it('returns true for year-based relative strings', () => {
    expect(isRelativeDate('-1y')).toBe(true);
    expect(isRelativeDate('-2y')).toBe(true);
  });

  it('returns true for anchor presets', () => {
    expect(isRelativeDate('mStart')).toBe(true);
    expect(isRelativeDate('yStart')).toBe(true);
  });

  it('returns false for absolute dates', () => {
    expect(isRelativeDate('2026-03-01')).toBe(false);
    expect(isRelativeDate('2025-12-31')).toBe(false);
  });

  it('returns false for invalid strings', () => {
    expect(isRelativeDate('')).toBe(false);
    expect(isRelativeDate('7d')).toBe(false);
    expect(isRelativeDate('abc')).toBe(false);
  });
});

describe('resolveRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix time to 2026-03-02 12:00:00 local
    vi.setSystemTime(new Date(2026, 2, 2, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through absolute dates', () => {
    expect(resolveRelativeDate('2026-01-15')).toBe('2026-01-15');
    expect(resolveRelativeDate('2025-06-30')).toBe('2025-06-30');
  });

  it('resolves -Nd to N days ago', () => {
    expect(resolveRelativeDate('-7d')).toBe('2026-02-23');
    expect(resolveRelativeDate('-30d')).toBe('2026-01-31');
    expect(resolveRelativeDate('-1d')).toBe('2026-03-01');
  });

  it('resolves -Ny to N*365 days ago', () => {
    expect(resolveRelativeDate('-1y')).toBe('2025-03-02');
  });

  it('resolves mStart to first day of current month', () => {
    expect(resolveRelativeDate('mStart')).toBe('2026-03-01');
  });

  it('resolves yStart to first day of current year', () => {
    expect(resolveRelativeDate('yStart')).toBe('2026-01-01');
  });

  it('returns unknown formats as-is', () => {
    expect(resolveRelativeDate('invalid')).toBe('invalid');
  });
});

describe('getActivePreset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 2, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches relative date strings to preset', () => {
    expect(getActivePreset('-7d', todayIso())).toBe('-7d');
    expect(getActivePreset('-30d', todayIso())).toBe('-30d');
    expect(getActivePreset('-90d', todayIso())).toBe('-90d');
    expect(getActivePreset('-180d', todayIso())).toBe('-180d');
    expect(getActivePreset('-1y', todayIso())).toBe('-1y');
  });

  it('matches anchor presets', () => {
    expect(getActivePreset('mStart', todayIso())).toBe('mStart');
    expect(getActivePreset('yStart', todayIso())).toBe('yStart');
  });

  it('matches legacy absolute dates to presets', () => {
    expect(getActivePreset(daysAgoIso(7), todayIso())).toBe('-7d');
    expect(getActivePreset(daysAgoIso(30), todayIso())).toBe('-30d');
  });

  it('returns undefined for custom date ranges', () => {
    expect(getActivePreset('2025-01-01', '2025-01-31')).toBeUndefined();
    expect(getActivePreset('-7d', '2025-12-31')).toBeUndefined();
  });

  it('returns undefined for non-preset relative strings', () => {
    expect(getActivePreset('-5d', todayIso())).toBeUndefined();
    expect(getActivePreset('-15d', todayIso())).toBeUndefined();
  });
});

describe('defaultDateRange', () => {
  it('returns relative -30d as from', () => {
    const range = defaultDateRange();
    expect(range.from).toBe('-30d');
  });

  it('returns today as to', () => {
    const range = defaultDateRange();
    expect(range.to).toBe(todayIso());
  });
});

describe('DATE_PRESETS', () => {
  it('all have relative strings', () => {
    for (const preset of DATE_PRESETS) {
      expect(isRelativeDate(preset.relative)).toBe(true);
    }
  });

  it('has expected presets', () => {
    expect(DATE_PRESETS.map((p) => p.relative)).toEqual(['-7d', '-30d', '-90d', '-180d', '-1y']);
  });
});

describe('ANCHOR_PRESETS', () => {
  it('has MTD and YTD', () => {
    expect(ANCHOR_PRESETS.map((p) => p.relative)).toEqual(['mStart', 'yStart']);
  });
});
