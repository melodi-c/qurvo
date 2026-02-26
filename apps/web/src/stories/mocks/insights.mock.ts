import type { AiInsight, AiInsightDtoTypeEnum } from '@/api/generated/Api';

// ── Helper ────────────────────────────────────────────────────────────────────

let _idCounter = 1;

/**
 * Build an AiInsight with sensible defaults.
 * Pass `overrides` to customise any field.
 */
export function makeInsight(
  type: AiInsightDtoTypeEnum,
  title: string,
  description: string,
  overrides: Partial<AiInsight> = {},
): AiInsight {
  const id = `insight-${_idCounter++}`;
  return {
    id,
    project_id: 'proj-1',
    type,
    title,
    description,
    created_at: new Date().toISOString(),
    dismissed_at: null,
    ...overrides,
  };
}

// ── Individual fixtures ───────────────────────────────────────────────────────

/** Metric change — positive trend. */
export const INSIGHT_METRIC_CHANGE = makeInsight(
  'metric_change',
  'Pageviews up 32% this week',
  'Your pageview count increased from 24,100 to 31,900 compared to the previous week. The spike correlates with the blog post published on Monday.',
);

/** New event — a previously unseen event has appeared. */
export const INSIGHT_NEW_EVENT = makeInsight(
  'new_event',
  'New event detected: checkout_v2',
  'The event "checkout_v2" was fired 1,240 times in the last 24 hours. This event was not seen before — it may indicate a new flow or a naming change in your tracking code.',
);

/** Retention anomaly — cohort retention dropped significantly. */
export const INSIGHT_RETENTION_ANOMALY = makeInsight(
  'retention_anomaly',
  'Week-1 retention dropped to 38%',
  'Users acquired last Monday are returning at 38%, compared to a 14-day baseline of 54%. Consider investigating whether a recent product change has impacted activation.',
);

/** Conversion correlation — two events are correlated with higher conversion. */
export const INSIGHT_CONVERSION_CORRELATION = makeInsight(
  'conversion_correlation',
  'Users who view_pricing convert 3× more',
  'Users who fire the "view_pricing" event within their first session have a 21% trial-to-paid conversion rate vs. 7% for users who skip it.',
);

// ── Named aliases matching issue spec ─────────────────────────────────────────

export const INSIGHT_TREND = INSIGHT_METRIC_CHANGE;
export const INSIGHT_FUNNEL = INSIGHT_CONVERSION_CORRELATION;

/** Array with one insight of each type — useful for list/table stories. */
export const INSIGHTS_ALL_TYPES: AiInsight[] = [
  INSIGHT_METRIC_CHANGE,
  INSIGHT_NEW_EVENT,
  INSIGHT_RETENTION_ANOMALY,
  INSIGHT_CONVERSION_CORRELATION,
];
