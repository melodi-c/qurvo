import type { RetentionResult } from '@/api/generated/Api';

/**
 * Day-granularity retention — 14 periods, no cohort rows.
 * Suitable for RetentionChart average-only view.
 */
export const RETENTION_DAY_RESULT: RetentionResult = {
  retention_type: 'first_time',
  granularity: 'day',
  average_retention: [
    100, 62.5, 45.2, 38.1, 31.7, 28.4, 25.0, 22.3, 20.1, 18.6, 17.2, 16.0,
    15.1, 14.3,
  ],
  cohorts: [],
};

/**
 * Day-granularity retention with cohort rows — 7 cohorts, 7 periods each.
 * Suitable for RetentionTable.
 */
export const RETENTION_DAY_RESULT_WITH_COHORTS: RetentionResult = {
  retention_type: 'first_time',
  granularity: 'day',
  average_retention: [100, 62.5, 45.2, 38.1, 31.7, 28.4, 25.0],
  cohorts: [
    {
      cohort_date: '2024-12-17',
      cohort_size: 320,
      periods: [320, 198, 145, 122, 101, 90, 79],
    },
    {
      cohort_date: '2024-12-18',
      cohort_size: 287,
      periods: [287, 181, 130, 110, 92, 82],
    },
    {
      cohort_date: '2024-12-19',
      cohort_size: 412,
      periods: [412, 255, 187, 157, 131],
    },
    {
      cohort_date: '2024-12-20',
      cohort_size: 198,
      periods: [198, 123, 90, 75],
    },
    {
      cohort_date: '2024-12-21',
      cohort_size: 356,
      periods: [356, 222, 161],
    },
    {
      cohort_date: '2024-12-22',
      cohort_size: 275,
      periods: [275, 172],
    },
    {
      cohort_date: '2024-12-23',
      cohort_size: 390,
      periods: [390],
    },
  ],
};

/**
 * Week-granularity retention — 8 periods, no cohort rows.
 * Suitable for compact RetentionChart.
 */
export const RETENTION_WEEK_RESULT: RetentionResult = {
  retention_type: 'first_time',
  granularity: 'week',
  average_retention: [100, 55.3, 41.8, 34.2, 29.7, 26.1, 23.4, 21.0],
  cohorts: [],
};

/**
 * Week-granularity retention with cohort rows — 8 cohorts, triangular data.
 * Suitable for RetentionTable with realistic decreasing cohort coverage.
 */
export const RETENTION_WEEK_RESULT_WITH_COHORTS: RetentionResult = {
  retention_type: 'first_time',
  granularity: 'week',
  average_retention: [100, 55.3, 41.8, 34.2, 29.7, 26.1, 23.4, 21.0],
  cohorts: [
    {
      cohort_date: '2024-11-04',
      cohort_size: 1240,
      periods: [1240, 714, 532, 438, 382, 336, 298, 268],
    },
    {
      cohort_date: '2024-11-11',
      cohort_size: 980,
      periods: [980, 521, 392, 315, 271, 237, 208],
    },
    {
      cohort_date: '2024-11-18',
      cohort_size: 1105,
      periods: [1105, 596, 453, 362, 310, 271],
    },
    {
      cohort_date: '2024-11-25',
      cohort_size: 870,
      periods: [870, 458, 347, 275, 236],
    },
    {
      cohort_date: '2024-12-02',
      cohort_size: 1340,
      periods: [1340, 736, 562, 449],
    },
    {
      cohort_date: '2024-12-09',
      cohort_size: 920,
      periods: [920, 492, 374],
    },
    {
      cohort_date: '2024-12-16',
      cohort_size: 760,
      periods: [760, 401],
    },
    {
      cohort_date: '2024-12-23',
      cohort_size: 610,
      periods: [610],
    },
  ],
};
