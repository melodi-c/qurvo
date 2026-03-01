import type { InsightType } from '@/api/generated/Api';

const INSIGHT_TYPE_SLUGS: Record<InsightType, string> = {
  trend: 'trends',
  funnel: 'funnels',
  retention: 'retentions',
  lifecycle: 'lifecycles',
  stickiness: 'stickiness',
  paths: 'paths',
};

// route() helper — single source of truth for path pattern + builder function

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic function constraint requires any
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

// routes — call for navigation, read .pattern for <Route path="">

/** Pure path builders — no projectId, no navigation. */
export const routes = {
  login: route('/login'),
  register: route('/register'),
  verifyEmail: route('/verify-email'),

  home: route('/'),
  projects: route('/projects'),
  invites: route('/invites'),
  profile: route('/profile', (params?: { tab?: string }) => {
    if (params?.tab) {return `/profile?tab=${params.tab}`;}
    return '/profile';
  }),

  // Project-scoped routes — all require projectId as first argument
  keys: route(
    '/projects/:projectId/keys',
    (projectId: string) => `/projects/${projectId}/keys`,
  ),
  settings: route(
    '/projects/:projectId/settings',
    (projectId: string) => `/projects/${projectId}/settings`,
  ),

  webAnalytics: route(
    '/projects/:projectId/web-analytics',
    (projectId: string) => `/projects/${projectId}/web-analytics`,
  ),

  dashboards: {
    list: route(
      '/projects/:projectId/dashboards',
      (projectId: string) => `/projects/${projectId}/dashboards`,
    ),
    detail: route(
      '/projects/:projectId/dashboards/:id',
      (projectId: string, id: string) => `/projects/${projectId}/dashboards/${id}`,
    ),
  },

  insights: {
    list: route(
      '/projects/:projectId/insights',
      (projectId: string) => `/projects/${projectId}/insights`,
    ),
    trends: {
      new: route(
        '/projects/:projectId/insights/trends/new',
        (projectId: string) => `/projects/${projectId}/insights/trends/new`,
      ),
      detail: route(
        '/projects/:projectId/insights/trends/:insightId',
        (projectId: string, insightId: string) =>
          `/projects/${projectId}/insights/trends/${insightId}`,
      ),
    },
    funnels: {
      new: route(
        '/projects/:projectId/insights/funnels/new',
        (projectId: string) => `/projects/${projectId}/insights/funnels/new`,
      ),
      detail: route(
        '/projects/:projectId/insights/funnels/:insightId',
        (projectId: string, insightId: string) =>
          `/projects/${projectId}/insights/funnels/${insightId}`,
      ),
    },
    retentions: {
      new: route(
        '/projects/:projectId/insights/retentions/new',
        (projectId: string) => `/projects/${projectId}/insights/retentions/new`,
      ),
      detail: route(
        '/projects/:projectId/insights/retentions/:insightId',
        (projectId: string, insightId: string) =>
          `/projects/${projectId}/insights/retentions/${insightId}`,
      ),
    },
    lifecycles: {
      new: route(
        '/projects/:projectId/insights/lifecycles/new',
        (projectId: string) => `/projects/${projectId}/insights/lifecycles/new`,
      ),
      detail: route(
        '/projects/:projectId/insights/lifecycles/:insightId',
        (projectId: string, insightId: string) =>
          `/projects/${projectId}/insights/lifecycles/${insightId}`,
      ),
    },
    stickiness: {
      new: route(
        '/projects/:projectId/insights/stickiness/new',
        (projectId: string) => `/projects/${projectId}/insights/stickiness/new`,
      ),
      detail: route(
        '/projects/:projectId/insights/stickiness/:insightId',
        (projectId: string, insightId: string) =>
          `/projects/${projectId}/insights/stickiness/${insightId}`,
      ),
    },
    paths: {
      new: route(
        '/projects/:projectId/insights/paths/new',
        (projectId: string) => `/projects/${projectId}/insights/paths/new`,
      ),
      detail: route(
        '/projects/:projectId/insights/paths/:insightId',
        (projectId: string, insightId: string) =>
          `/projects/${projectId}/insights/paths/${insightId}`,
      ),
    },

    newByType: route(
      '/projects/:projectId/insights/:type/new',
      (projectId: string, type: InsightType) =>
        `/projects/${projectId}/insights/${INSIGHT_TYPE_SLUGS[type]}/new`,
    ),
    detailByType: route(
      '/projects/:projectId/insights/:type/:insightId',
      (projectId: string, type: InsightType, insightId: string) =>
        `/projects/${projectId}/insights/${INSIGHT_TYPE_SLUGS[type]}/${insightId}`,
    ),
  },

  cohorts: {
    list: route(
      '/projects/:projectId/cohorts',
      (projectId: string) => `/projects/${projectId}/cohorts`,
    ),
    new: route(
      '/projects/:projectId/cohorts/new',
      (projectId: string) => `/projects/${projectId}/cohorts/new`,
    ),
    detail: route(
      '/projects/:projectId/cohorts/:cohortId',
      (projectId: string, cohortId: string) => `/projects/${projectId}/cohorts/${cohortId}`,
    ),
  },

  events: route(
    '/projects/:projectId/events',
    (projectId: string) => `/projects/${projectId}/events`,
  ),

  persons: {
    list: route(
      '/projects/:projectId/persons',
      (projectId: string) => `/projects/${projectId}/persons`,
    ),
    detail: route(
      '/projects/:projectId/persons/:personId',
      (projectId: string, personId: string) => `/projects/${projectId}/persons/${personId}`,
    ),
  },

  ai: route(
    '/projects/:projectId/ai',
    (projectId: string) => `/projects/${projectId}/ai`,
  ),
  dataManagement: {
    list: route(
      '/projects/:projectId/data-management',
      (projectId: string) => `/projects/${projectId}/data-management`,
    ),
    detail: route(
      '/projects/:projectId/data-management/:eventName',
      (projectId: string, eventName: string) =>
        `/projects/${projectId}/data-management/${encodeURIComponent(eventName)}`,
    ),
  },

  admin: {
    overview: route('/admin'),
    users: {
      list: route('/admin/users'),
      detail: route('/admin/users/:id', (id: string) => `/admin/users/${id}`),
    },
    projects: {
      list: route('/admin/projects'),
      detail: route('/admin/projects/:id', (id: string) => `/admin/projects/${id}`),
    },
    plans: {
      list: route('/admin/plans'),
    },
  },

  share: {
    dashboard: route(
      '/share/dashboard/:shareToken',
      (shareToken: string) => `/share/dashboard/${shareToken}`,
    ),
    insight: route(
      '/share/insight/:shareToken',
      (shareToken: string) => `/share/insight/${shareToken}`,
    ),
  },

  legacy: {
    trends: route('/trends'),
    funnels: route('/funnels'),
    retentions: route('/retentions'),
  },
};

/** Recursively wraps route functions so each call goes through `transform`. */
 
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
