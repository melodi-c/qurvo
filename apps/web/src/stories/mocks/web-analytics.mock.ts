import type {
  WebAnalyticsKPIs,
  WebAnalyticsTimeseriesPoint,
  WebAnalyticsDimensionRow,
} from '@/api/generated/Api';

// ── KPIs ──────────────────────────────────────────────────────────────────────

/** Current-period KPIs for the web analytics overview. */
export const WEB_KPIS_CURRENT: WebAnalyticsKPIs = {
  unique_visitors: 12400,
  pageviews: 34700,
  sessions: 18900,
  avg_duration_seconds: 187,
  bounce_rate: 42.3,
};

/** Previous-period KPIs — used for delta/trend indicators. */
export const WEB_KPIS_PREVIOUS: WebAnalyticsKPIs = {
  unique_visitors: 10200,
  pageviews: 28400,
  sessions: 15600,
  avg_duration_seconds: 210,
  bounce_rate: 50.1,
};

// ── Timeseries ────────────────────────────────────────────────────────────────

/**
 * 30-day timeseries with deterministic sinusoidal + offset values.
 * Buckets are ISO datetime strings (midnight UTC) going back 30 days from a
 * fixed reference date so stories remain stable across rebuilds.
 *
 * NOTE: We use a fixed reference (2025-02-27) rather than `new Date()` to
 * keep snapshots deterministic. When you need dynamic dates in a story,
 * generate your own buckets inline.
 */
function makeWebTimeseries(days: number): WebAnalyticsTimeseriesPoint[] {
  const points: WebAnalyticsTimeseriesPoint[] = [];
  // Fixed reference date — avoids snapshot churn.
  const ref = new Date('2025-02-27T00:00:00.000Z');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() - i);
    points.push({
      bucket: d.toISOString(),
      unique_visitors: 800 + Math.round(Math.sin((days - 1 - i) * 0.4) * 200 + ((days - 1 - i) * 5)),
      pageviews: 2000 + Math.round(Math.sin((days - 1 - i) * 0.35) * 500 + ((days - 1 - i) * 10)),
      sessions: 1100 + Math.round(Math.sin((days - 1 - i) * 0.45) * 250 + ((days - 1 - i) * 7)),
    });
  }
  return points;
}

export const TIMESERIES_30D: WebAnalyticsTimeseriesPoint[] = makeWebTimeseries(30);

// ── Page rows ─────────────────────────────────────────────────────────────────

export const PAGE_ROWS: WebAnalyticsDimensionRow[] = [
  { name: '/home', visitors: 4200, pageviews: 6100 },
  { name: '/pricing', visitors: 2800, pageviews: 3900 },
  { name: '/docs/quickstart', visitors: 1900, pageviews: 2600 },
  { name: '/blog/analytics-guide', visitors: 1400, pageviews: 1950 },
  { name: '/login', visitors: 980, pageviews: 1200 },
];

export const ENTRY_PAGE_ROWS: WebAnalyticsDimensionRow[] = [
  { name: '/home', visitors: 3100, pageviews: 3100 },
  { name: '/pricing', visitors: 1500, pageviews: 1500 },
  { name: '/blog/analytics-guide', visitors: 900, pageviews: 900 },
];

export const EXIT_PAGE_ROWS: WebAnalyticsDimensionRow[] = [
  { name: '/pricing', visitors: 1800, pageviews: 2100 },
  { name: '/login', visitors: 760, pageviews: 900 },
  { name: '/home', visitors: 620, pageviews: 750 },
];

// ── Source rows ───────────────────────────────────────────────────────────────

export const SOURCE_ROWS: WebAnalyticsDimensionRow[] = [
  { name: 'google.com', visitors: 5400, pageviews: 9200 },
  { name: 'twitter.com', visitors: 1800, pageviews: 2600 },
  { name: 'github.com', visitors: 950, pageviews: 1300 },
  { name: 'newsletter', visitors: 720, pageviews: 1050 },
  { name: 'direct', visitors: 530, pageviews: 680 },
];

export const UTM_SOURCE_ROWS: WebAnalyticsDimensionRow[] = [
  { name: 'newsletter', visitors: 2100, pageviews: 3000 },
  { name: 'google', visitors: 1600, pageviews: 2200 },
  { name: 'twitter', visitors: 480, pageviews: 650 },
];

export const UTM_CAMPAIGN_ROWS: WebAnalyticsDimensionRow[] = [
  { name: 'spring-launch-2024', visitors: 890, pageviews: 1200 },
  { name: 'retargeting-q1', visitors: 410, pageviews: 580 },
];
