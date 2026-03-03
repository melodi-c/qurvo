import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRelativeDate,
  resolveRelativeDate,
  getActivePreset,
  getPresetLabelKey,
  todayIso,
  daysAgoIso,
  defaultDateRange,
  DATE_PRESETS,
  ANCHOR_PRESETS,
} from './date-utils';

describe('isRelativeDate', () => {
  it('returns true for day-based relative strings', () => {
    expect(isRelativeDate('-0d')).toBe(true);
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
    // Fix time to 2026-03-02 12:00:00 UTC
    vi.setSystemTime(new Date('2026-03-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through absolute dates', () => {
    expect(resolveRelativeDate('2026-01-15')).toBe('2026-01-15');
    expect(resolveRelativeDate('2025-06-30')).toBe('2025-06-30');
  });

  it('resolves -0d to today', () => {
    expect(resolveRelativeDate('-0d', 'UTC')).toBe('2026-03-02');
  });

  it('resolves -Nd to N days ago', () => {
    expect(resolveRelativeDate('-7d', 'UTC')).toBe('2026-02-23');
    expect(resolveRelativeDate('-30d', 'UTC')).toBe('2026-01-31');
    expect(resolveRelativeDate('-1d', 'UTC')).toBe('2026-03-01');
  });

  it('resolves -Ny to N*365 days ago', () => {
    expect(resolveRelativeDate('-1y', 'UTC')).toBe('2025-03-02');
  });

  it('resolves mStart to first day of current month', () => {
    expect(resolveRelativeDate('mStart', 'UTC')).toBe('2026-03-01');
  });

  it('resolves yStart to first day of current year', () => {
    expect(resolveRelativeDate('yStart', 'UTC')).toBe('2026-01-01');
  });

  it('returns unknown formats as-is', () => {
    expect(resolveRelativeDate('invalid')).toBe('invalid');
  });
});

describe('resolveRelativeDate — timezone-aware', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves -0d to today in the specified timezone', () => {
    vi.useFakeTimers();
    // 2026-03-02 23:30 UTC = 2026-03-03 08:30 in Asia/Tokyo (UTC+9)
    vi.setSystemTime(new Date('2026-03-02T23:30:00Z'));

    // With explicit UTC: today = Mar 02
    expect(resolveRelativeDate('-0d', 'UTC')).toBe('2026-03-02');
    // With Asia/Tokyo: it's already Mar 03 there
    expect(resolveRelativeDate('-0d', 'Asia/Tokyo')).toBe('2026-03-03');
    // With America/New_York (UTC-5): still Mar 02
    expect(resolveRelativeDate('-0d', 'America/New_York')).toBe('2026-03-02');
  });

  it('resolves -7d using the specified timezone for "today"', () => {
    vi.useFakeTimers();
    // 2026-03-02 23:30 UTC = 2026-03-03 in Asia/Tokyo
    vi.setSystemTime(new Date('2026-03-02T23:30:00Z'));

    // In Asia/Tokyo, today is Mar 03 -> 7 days ago = Feb 24
    expect(resolveRelativeDate('-7d', 'Asia/Tokyo')).toBe('2026-02-24');
    // In UTC, today is Mar 02 -> 7 days ago = Feb 23
    expect(resolveRelativeDate('-7d', 'UTC')).toBe('2026-02-23');
  });

  it('resolves mStart in the specified timezone', () => {
    vi.useFakeTimers();
    // 2026-02-28 23:30 UTC = 2026-03-01 in Asia/Tokyo
    vi.setSystemTime(new Date('2026-02-28T23:30:00Z'));

    // In Asia/Tokyo it's March -> mStart = Mar 01
    expect(resolveRelativeDate('mStart', 'Asia/Tokyo')).toBe('2026-03-01');
    // In UTC it's still February -> mStart = Feb 01
    expect(resolveRelativeDate('mStart', 'UTC')).toBe('2026-02-01');
  });

  it('resolves yStart in the specified timezone', () => {
    vi.useFakeTimers();
    // 2025-12-31 23:30 UTC = 2026-01-01 in Asia/Tokyo
    vi.setSystemTime(new Date('2025-12-31T23:30:00Z'));

    // In Asia/Tokyo it's 2026 -> yStart = Jan 01, 2026
    expect(resolveRelativeDate('yStart', 'Asia/Tokyo')).toBe('2026-01-01');
    // In UTC it's still 2025 -> yStart = Jan 01, 2025
    expect(resolveRelativeDate('yStart', 'UTC')).toBe('2025-01-01');
  });

  it('passes through absolute dates regardless of timezone', () => {
    expect(resolveRelativeDate('2026-01-15', 'Asia/Tokyo')).toBe('2026-01-15');
  });
});

describe('todayIso — timezone-aware', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today in the specified timezone', () => {
    vi.useFakeTimers();
    // 2026-03-02 23:30 UTC = 2026-03-03 in Asia/Tokyo
    vi.setSystemTime(new Date('2026-03-02T23:30:00Z'));

    expect(todayIso('Asia/Tokyo')).toBe('2026-03-03');
    expect(todayIso('UTC')).toBe('2026-03-02');
  });
});

describe('daysAgoIso — timezone-aware', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes days ago from today in the specified timezone', () => {
    vi.useFakeTimers();
    // 2026-03-02 23:30 UTC = 2026-03-03 in Asia/Tokyo
    vi.setSystemTime(new Date('2026-03-02T23:30:00Z'));

    // In Asia/Tokyo, today is Mar 03 -> 7 days ago = Feb 24
    expect(daysAgoIso(7, 'Asia/Tokyo')).toBe('2026-02-24');
    // In UTC, today is Mar 02 -> 7 days ago = Feb 23
    expect(daysAgoIso(7, 'UTC')).toBe('2026-02-23');
  });
});

describe('getActivePreset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches relative date strings to preset with -0d dateTo', () => {
    expect(getActivePreset('-7d', '-0d')).toBe('-7d');
    expect(getActivePreset('-30d', '-0d')).toBe('-30d');
    expect(getActivePreset('-90d', '-0d')).toBe('-90d');
    expect(getActivePreset('-180d', '-0d')).toBe('-180d');
    expect(getActivePreset('-1y', '-0d')).toBe('-1y');
  });

  it('matches relative date strings to preset with legacy absolute dateTo', () => {
    expect(getActivePreset('-7d', todayIso())).toBe('-7d');
    expect(getActivePreset('-30d', todayIso())).toBe('-30d');
  });

  it('matches anchor presets', () => {
    expect(getActivePreset('mStart', '-0d')).toBe('mStart');
    expect(getActivePreset('yStart', '-0d')).toBe('yStart');
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
    expect(getActivePreset('-5d', '-0d')).toBeUndefined();
    expect(getActivePreset('-15d', '-0d')).toBeUndefined();
  });
});

describe('getPresetLabelKey', () => {
  it('maps day-based presets to label keys', () => {
    expect(getPresetLabelKey('-7d')).toBe('last7days');
    expect(getPresetLabelKey('-30d')).toBe('last30days');
    expect(getPresetLabelKey('-90d')).toBe('last90days');
    expect(getPresetLabelKey('-180d')).toBe('last6months');
    expect(getPresetLabelKey('-1y')).toBe('last1year');
  });

  it('maps anchor presets to label keys', () => {
    expect(getPresetLabelKey('mStart')).toBe('monthToDate');
    expect(getPresetLabelKey('yStart')).toBe('yearToDate');
  });

  it('returns undefined for absolute dates', () => {
    expect(getPresetLabelKey('2026-03-01')).toBeUndefined();
  });

  it('returns undefined for non-preset relative strings', () => {
    expect(getPresetLabelKey('-5d')).toBeUndefined();
    expect(getPresetLabelKey('-15d')).toBeUndefined();
  });
});

describe('defaultDateRange', () => {
  it('returns relative -30d as from', () => {
    const range = defaultDateRange();
    expect(range.from).toBe('-30d');
  });

  it('returns relative -0d as to', () => {
    const range = defaultDateRange();
    expect(range.to).toBe('-0d');
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
