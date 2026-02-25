import type { InsightType } from '@/api/generated/Api';

const INSIGHT_TYPE_SLUGS: Record<InsightType, string> = {
  trend: 'trends',
  funnel: 'funnels',
  retention: 'retentions',
  lifecycle: 'lifecycles',
  stickiness: 'stickiness',
  paths: 'paths',
};

// ---------------------------------------------------------------------------
// route() helper — single source of truth for path pattern + builder function
// ---------------------------------------------------------------------------

type Route<F extends (...args: any[]) => string> = F & { pattern: string };

function route(pattern: string): Route<() => string>;
function route<A extends unknown[]>(
  pattern: string,
  build: (...args: A) => string,
): Route<(...args: A) => string>;
function route(
  pattern: string,
  build?: (...args: unknown[]) => string,
): Route<(...args: unknown[]) => string> {
  const fn = (build ?? (() => pattern)) as Route<(...args: unknown[]) => string>;
  fn.pattern = pattern;
  return fn;
}

// ---------------------------------------------------------------------------
// routes — call for navigation, read .pattern for <Route path="">
// ---------------------------------------------------------------------------

/** Pure path builders — no projectId, no navigation. */
export const routes = {
  login: route('/login'),
  register: route('/register'),
  verifyEmail: route('/verify-email'),

  home: route('/'),
  projects: route('/projects'),
  keys: route('/keys'),
  settings: route('/settings'),
  invites: route('/invites'),
  profile: route('/profile', (params?: { tab?: string }) => {
    if (params?.tab) return `/profile?tab=${params.tab}`;
    return '/profile';
  }),

  webAnalytics: route('/web-analytics'),

  dashboards: {
    list: route('/dashboards'),
    detail: route('/dashboards/:id', (id: string) => `/dashboards/${id}`),
  },

  insights: {
    list: route('/insights'),
    trends: {
      new: route('/insights/trends/new'),
      detail: route(
        '/insights/trends/:insightId',
        (insightId: string) => `/insights/trends/${insightId}`,
      ),
    },
    funnels: {
      new: route('/insights/funnels/new'),
      detail: route(
        '/insights/funnels/:insightId',
        (insightId: string) => `/insights/funnels/${insightId}`,
      ),
    },
    retentions: {
      new: route('/insights/retentions/new'),
      detail: route(
        '/insights/retentions/:insightId',
        (insightId: string) => `/insights/retentions/${insightId}`,
      ),
    },
    lifecycles: {
      new: route('/insights/lifecycles/new'),
      detail: route(
        '/insights/lifecycles/:insightId',
        (insightId: string) => `/insights/lifecycles/${insightId}`,
      ),
    },
    stickiness: {
      new: route('/insights/stickiness/new'),
      detail: route(
        '/insights/stickiness/:insightId',
        (insightId: string) => `/insights/stickiness/${insightId}`,
      ),
    },
    paths: {
      new: route('/insights/paths/new'),
      detail: route(
        '/insights/paths/:insightId',
        (insightId: string) => `/insights/paths/${insightId}`,
      ),
    },

    newByType: route(
      '/insights/:type/new',
      (type: InsightType) => `/insights/${INSIGHT_TYPE_SLUGS[type]}/new`,
    ),
    detailByType: route(
      '/insights/:type/:insightId',
      (type: InsightType, insightId: string) =>
        `/insights/${INSIGHT_TYPE_SLUGS[type]}/${insightId}`,
    ),
  },

  cohorts: {
    list: route('/cohorts'),
    new: route('/cohorts/new'),
    detail: route('/cohorts/:cohortId', (cohortId: string) => `/cohorts/${cohortId}`),
  },

  events: route('/events'),

  persons: {
    list: route('/persons'),
    detail: route('/persons/:personId', (personId: string) => `/persons/${personId}`),
  },

  ai: route('/ai'),
  dataManagement: {
    list: route('/data-management'),
    detail: route(
      '/data-management/:eventName',
      (eventName: string) => `/data-management/${encodeURIComponent(eventName)}`,
    ),
  },

  legacy: {
    trends: route('/trends'),
    funnels: route('/funnels'),
    retentions: route('/retentions'),
  },
};

/** Recursively wraps route functions so each call goes through `transform`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WrapRoutes<T, R> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => R
    : T[K] extends Record<string, unknown>
      ? WrapRoutes<T[K], R>
      : never;
};

export function wrapRoutes<R>(
  obj: typeof routes,
  transform: (path: string) => R,
): WrapRoutes<typeof routes, R> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'function') {
      result[key] = (...args: unknown[]) =>
        transform((value as (...a: unknown[]) => string)(...args));
    } else if (typeof value === 'object' && value !== null) {
      result[key] = wrapRoutes(value as typeof routes, transform);
    }
  }
  return result as WrapRoutes<typeof routes, R>;
}
