import type { StickinessResult } from '@/api/generated/Api';

/**
 * Daily stickiness — 14 periods.
 * Models a typical power-law decay: many 1-day users, few heavy daily users.
 */
export const STICKINESS_DAILY_14: StickinessResult = {
  granularity: 'day',
  total_periods: 14,
  data: [
    { period_count: 1, user_count: 520 },
    { period_count: 2, user_count: 310 },
    { period_count: 3, user_count: 198 },
    { period_count: 4, user_count: 145 },
    { period_count: 5, user_count: 112 },
    { period_count: 6, user_count: 87 },
    { period_count: 7, user_count: 74 },
    { period_count: 8, user_count: 61 },
    { period_count: 9, user_count: 53 },
    { period_count: 10, user_count: 48 },
    { period_count: 11, user_count: 39 },
    { period_count: 12, user_count: 34 },
    { period_count: 13, user_count: 28 },
    { period_count: 14, user_count: 21 },
  ],
};

/**
 * Weekly stickiness — 4 periods.
 * Shows users active in 1–4 weeks of the measurement window.
 */
export const STICKINESS_WEEKLY_4: StickinessResult = {
  granularity: 'week',
  total_periods: 4,
  data: [
    { period_count: 1, user_count: 248 },
    { period_count: 2, user_count: 91 },
    { period_count: 3, user_count: 37 },
    { period_count: 4, user_count: 12 },
  ],
};

/**
 * Monthly stickiness — 6 periods.
 * Useful for long-window engagement analysis.
 */
export const STICKINESS_MONTHLY_6: StickinessResult = {
  granularity: 'month',
  total_periods: 6,
  data: [
    { period_count: 1, user_count: 840 },
    { period_count: 2, user_count: 530 },
    { period_count: 3, user_count: 320 },
    { period_count: 4, user_count: 195 },
    { period_count: 5, user_count: 98 },
    { period_count: 6, user_count: 42 },
  ],
};
